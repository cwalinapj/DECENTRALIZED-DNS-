import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import nacl from "tweetnacl";
import { Keypair, PublicKey } from "@solana/web3.js";

type WitnessReceiptV1 = {
  version: 1;
  name: string;
  name_hash: string; // hex (32 bytes)
  rrset_hash: string; // hex (32 bytes)
  ttl_s: number;
  observed_at_bucket: number;
  witness_pubkey: string;
  signature: string; // base64
};

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function le32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

function le64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
}

function bucketUnix10m(unixSeconds: number): number {
  return Math.floor(unixSeconds / 600) * 600;
}

function normalizeName(input: string): string {
  const s0 = input.trim().toLowerCase();
  if (s0.endsWith(".")) return s0.slice(0, -1);
  return s0;
}

function isValidDnsLabel(label: string): boolean {
  if (label.length < 3 || label.length > 32) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;
  for (const ch of label) {
    const isAZ = ch >= "a" && ch <= "z";
    const is09 = ch >= "0" && ch <= "9";
    const isDash = ch === "-";
    if (!isAZ && !is09 && !isDash) return false;
  }
  return true;
}

function normalizeAndValidateName(name: string): string {
  const n = normalizeName(name);
  if (n.endsWith(".dns")) {
    const label = n.slice(0, -4);
    if (!isValidDnsLabel(label)) throw new Error("invalid .dns label rules");
    return n;
  }
  // ICANN fqdn MVP: length-only (ASCII), no punycode conversion.
  if (n.length < 1 || n.length > 253) throw new Error("invalid fqdn length");
  return n;
}

function witnessSignBytes(params: {
  name_hash: Buffer;
  rrset_hash: Buffer;
  ttl_s: number;
  observed_at_bucket: number;
}): Buffer {
  const domainSep = Buffer.from("DDNS_WITNESS_V1", "utf8");
  const msg = Buffer.concat([
    domainSep,
    params.name_hash,
    params.rrset_hash,
    le32(params.ttl_s),
    le64(BigInt(params.observed_at_bucket)),
  ]);
  return sha256(msg);
}

function loadKeypairFromEnv(envName: string): Keypair {
  const p = process.env[envName];
  if (!p) throw new Error(`missing env ${envName}`);
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

const SPOOL_DIR = process.env.SPOOL_DIR || path.resolve("spool");
const RECEIPTS_FILE = path.join(SPOOL_DIR, "receipts.jsonl");

const gatewayKeypair = loadKeypairFromEnv("GATEWAY_KEYPAIR");
const witnessPubkey = gatewayKeypair.publicKey.toBase58();

// In MVP, we resolve from a simple env mapping (name -> dest). This keeps the gateway runnable
// without requiring on-chain reads yet. Later: read CanonicalRoute PDA from ddns_registry.
// Format: DDNS_ROUTES_JSON='{"example.dns":"https://example.com"}'
function resolveDest(nameNorm: string): string | null {
  const raw = process.env.DDNS_ROUTES_JSON;
  if (!raw) return null;
  const obj = JSON.parse(raw) as Record<string, string>;
  return obj[nameNorm] || null;
}

function canonicalDest(dest: string): string {
  return dest.trim();
}

function destHash(dest: string): Buffer {
  return sha256(Buffer.from(canonicalDest(dest), "utf8"));
}

function emitReceipt(params: { name: string; rrset_hash: Buffer; ttl_s: number }): WitnessReceiptV1 {
  const name_norm = normalizeAndValidateName(params.name);
  const name_hash = sha256(Buffer.from(name_norm, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const observed_at_bucket = bucketUnix10m(now);
  const msgHash = witnessSignBytes({
    name_hash,
    rrset_hash: params.rrset_hash,
    ttl_s: params.ttl_s,
    observed_at_bucket,
  });
  const sig = nacl.sign.detached(msgHash, gatewayKeypair.secretKey);
  const rec: WitnessReceiptV1 = {
    version: 1,
    name: name_norm,
    name_hash: name_hash.toString("hex"),
    rrset_hash: params.rrset_hash.toString("hex"),
    ttl_s: params.ttl_s,
    observed_at_bucket,
    witness_pubkey: witnessPubkey,
    signature: Buffer.from(sig).toString("base64"),
  };
  ensureDir(SPOOL_DIR);
  fs.appendFileSync(RECEIPTS_FILE, JSON.stringify(rec) + "\n");
  return rec;
}

async function main() {
  // Important: no request logging (privacy). Keep Fastify logger disabled by default.
  const app = Fastify({ logger: false });

  app.get("/v1/health", async () => ({ ok: true, witness_pubkey: witnessPubkey }));

  // Minimal resolver endpoint (HTTP). Clients can treat this as a DoH-like gateway for MVP.
  app.get<{ Querystring: { name: string; ttl?: string } }>(
    "/v1/resolve",
    async (req: FastifyRequest<{ Querystring: { name: string; ttl?: string } }>, reply: FastifyReply) => {
    const name = String(req.query.name || "");
    const ttl_s = req.query.ttl ? Math.max(1, Math.min(86400, Number(req.query.ttl))) : 300;
    const name_norm = normalizeAndValidateName(name);

    const dest = resolveDest(name_norm);
    if (!dest) {
      reply.code(404);
      return { error: "not_found", name: name_norm };
    }

    const rrset_hash = destHash(dest);
    const receipt = emitReceipt({ name: name_norm, rrset_hash, ttl_s });
    return {
      name: name_norm,
      dest: canonicalDest(dest),
      ttl_s,
      proof: {
        rrset_hash_hex: rrset_hash.toString("hex"),
        witness_receipt: receipt,
      },
    };
    }
  );

  app.get<{ Querystring: { name?: string } }>(
    "/v1/receipts",
    async (req: FastifyRequest<{ Querystring: { name?: string } }>, _reply: FastifyReply) => {
    const name = req.query.name ? normalizeName(String(req.query.name)) : null;
    if (!fs.existsSync(RECEIPTS_FILE)) return { receipts: [] as WitnessReceiptV1[] };
    const lines = fs.readFileSync(RECEIPTS_FILE, "utf8").trim().split("\n").filter(Boolean);
    const receipts = lines
      .slice(-200)
      .map((l) => JSON.parse(l) as WitnessReceiptV1)
      .filter((r) => (name ? r.name === name : true));
    return { receipts };
    }
  );

  // Flush: create a batch file, compute hash, and optionally upload to IPFS (MVP can stub).
  app.post("/v1/flush", async () => {
    ensureDir(SPOOL_DIR);
    if (!fs.existsSync(RECEIPTS_FILE)) return { batch_hash_hex: null, count: 0, cid: null };
    const lines = fs.readFileSync(RECEIPTS_FILE, "utf8").trim().split("\n").filter(Boolean);
    const count = lines.length;
    const batch = lines.join("\n") + "\n";
    const batchHash = sha256(Buffer.from(batch, "utf8")).toString("hex");
    const outFile = path.join(SPOOL_DIR, `batch_${Date.now()}_${batchHash}.jsonl`);
    fs.writeFileSync(outFile, batch);

    // MVP: IPFS upload is optional and can be disabled.
    const ipfsApi = process.env.IPFS_API;
    let cid: string | null = null;
    if (ipfsApi) {
      // Stub: do not implement external network upload in MVP; keep deterministic placeholder.
      // Later: call IPFS HTTP API and return CID.
      cid = `ipfs://stub/${batchHash}`;
    }

    // Rotate spool file.
    fs.unlinkSync(RECEIPTS_FILE);
    return { batch_hash_hex: batchHash, count, cid, file: outFile };
  });

  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || "8788");
  await app.listen({ host, port });
  // eslint-disable-next-line no-console
  console.log("witness_gateway_listen:", `http://${host}:${port}`);
  console.log("witness_pubkey:", witnessPubkey);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

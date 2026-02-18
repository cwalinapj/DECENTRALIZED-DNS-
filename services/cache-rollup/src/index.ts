import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

type CacheEntryV1 = {
  version: 1;
  name_hash: string;
  parent_name_hash: string;
  rrset_hash: string;
  ttl_s: number;
  confidence_bps: number;
  observed_bucket: number;
  witness_pubkey: string;
  signature: string;
};

const PORT = Number(process.env.PORT || "8788");
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const CACHE_HEAD_PROGRAM_ID = process.env.DDNS_CACHE_HEAD_PROGRAM_ID || "";
const IPFS_API_URL = process.env.IPFS_API_URL || "";
const ROLLUP_SIGNER_KEYPAIR = process.env.ROLLUP_SIGNER_KEYPAIR || "";

const connection = new Connection(SOLANA_RPC_URL, "confirmed");
const maybeProgramId = CACHE_HEAD_PROGRAM_ID ? new PublicKey(CACHE_HEAD_PROGRAM_ID) : null;
const maybeSigner = ROLLUP_SIGNER_KEYPAIR ? loadKeypair(ROLLUP_SIGNER_KEYPAIR) : null;

const app = express();
app.use(express.json({ limit: "4mb" }));

fs.mkdirSync(DATA_DIR, { recursive: true });

app.get("/v1/health", (_req, res) => {
  res.json({ ok: true, rpc: SOLANA_RPC_URL, cacheHeadProgramId: CACHE_HEAD_PROGRAM_ID || null });
});

app.post("/v1/ingest", async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? (req.body.entries as unknown[]) : [];
  if (!entries.length) return res.status(400).json({ ok: false, error: "missing_entries" });

  const accepted: CacheEntryV1[] = [];
  for (const raw of entries) {
    const v = validateCacheEntry(raw);
    if (v.ok) accepted.push(v.entry);
  }
  if (!accepted.length) return res.status(400).json({ ok: false, error: "no_valid_entries" });

  const byParent = new Map<string, CacheEntryV1[]>();
  for (const e of accepted) {
    const list = byParent.get(e.parent_name_hash) || [];
    list.push(e);
    byParent.set(e.parent_name_hash, list);
  }

  for (const [parentHash, group] of byParent) {
    const file = path.join(DATA_DIR, `parent-${parentHash}.jsonl`);
    const payload = group.map((g) => JSON.stringify(g)).join("\n") + "\n";
    fs.appendFileSync(file, payload, "utf8");
  }

  res.json({ ok: true, accepted: accepted.length, parents: byParent.size });
});

app.post("/v1/rollup", async (req, res) => {
  try {
    const parent = String(req.query.parent || "").trim().toLowerCase().replace(/\.+$/, "");
    if (!parent) return res.status(400).json({ ok: false, error: "missing_parent" });
    const epochId = Number(req.query.epoch || Math.floor(Date.now() / 1000 / 600));

    const parentHash = sha256Hex(parent);
    const file = path.join(DATA_DIR, `parent-${parentHash}.jsonl`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: "no_entries_for_parent" });

    const entries = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CacheEntryV1)
      .sort((a, b) =>
        a.observed_bucket - b.observed_bucket ||
        a.name_hash.localeCompare(b.name_hash) ||
        a.rrset_hash.localeCompare(b.rrset_hash)
      );

    const leaves = entries.map((e) => hashEntry(e));
    const cacheRootHex = merkleRoot(leaves).toString("hex");
    const rollupDoc = {
      version: 1,
      parent,
      parent_name_hash: parentHash,
      epoch_id: epochId,
      count: entries.length,
      cache_root: cacheRootHex,
      entries,
      generated_at_unix: Math.floor(Date.now() / 1000)
    };

    const outDir = path.join(DATA_DIR, "rollups");
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${parentHash}-${epochId}.json`);
    fs.writeFileSync(outFile, JSON.stringify(rollupDoc, null, 2), "utf8");

    const { cid, cidHashHex } = await publishToIpfsOrStub(outFile, cacheRootHex);

    let onchain: any = null;
    if (maybeProgramId && maybeSigner) {
      onchain = await setCacheHeadOnChain(parentHash, cacheRootHex, cidHashHex, epochId);
    }

    // Optional REP awarding per contributor (witness pubkey), best-effort.
    const repAwardSummary = await maybeAwardRep(entries, epochId);

    res.json({
      ok: true,
      parent,
      parent_name_hash: parentHash,
      epoch_id: epochId,
      cache_root: cacheRootHex,
      cid,
      cid_hash: cidHashHex,
      count: entries.length,
      rollup_file: outFile,
      onchain,
      rep: repAwardSummary
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.get("/v1/cache-head", async (req, res) => {
  try {
    if (!maybeProgramId) return res.status(400).json({ ok: false, error: "DDNS_CACHE_HEAD_PROGRAM_ID_not_set" });
    const parent = String(req.query.parent || "").trim().toLowerCase().replace(/\.+$/, "");
    if (!parent) return res.status(400).json({ ok: false, error: "missing_parent" });
    const parentHash = sha256Hex(parent);
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("cache_head"), Buffer.from(parentHash, "hex")], maybeProgramId);
    const info = await connection.getAccountInfo(pda);
    if (!info) return res.status(404).json({ ok: false, parent, pda: pda.toBase58(), head: null });
    res.json({ ok: true, parent, pda: pda.toBase58(), head: parseCacheHead(info.data) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`cache-rollup listening on ${PORT}`);
});

function validateCacheEntry(raw: unknown): { ok: true; entry: CacheEntryV1 } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_object" };
  const keys = Object.keys(raw as any);
  const forbidden = ["ip", "client_ip", "ua", "user_agent", "mac", "wallet_pubkey", "client_id", "routing_metadata"];
  if (keys.some((k) => forbidden.includes(k))) return { ok: false, reason: "privacy_forbidden_field" };

  const e = raw as any;
  const entry: CacheEntryV1 = {
    version: 1,
    name_hash: hex32(e.name_hash),
    parent_name_hash: hex32(e.parent_name_hash),
    rrset_hash: hex32(e.rrset_hash),
    ttl_s: Math.max(1, Number(e.ttl_s || 0)),
    confidence_bps: clamp(Number(e.confidence_bps || 0), 0, 10000),
    observed_bucket: Number(e.observed_bucket || 0),
    witness_pubkey: hexN(e.witness_pubkey, 64),
    signature: hexN(e.signature, 128)
  };
  if (entry.observed_bucket <= 0 || entry.observed_bucket % 600 !== 0) {
    return { ok: false, reason: "invalid_bucket" };
  }
  return { ok: true, entry };
}

function hashEntry(e: CacheEntryV1): Buffer {
  const payload = JSON.stringify({
    version: e.version,
    name_hash: e.name_hash,
    parent_name_hash: e.parent_name_hash,
    rrset_hash: e.rrset_hash,
    ttl_s: e.ttl_s,
    confidence_bps: e.confidence_bps,
    observed_bucket: e.observed_bucket,
    witness_pubkey: e.witness_pubkey,
    signature: e.signature
  });
  return crypto.createHash("sha256").update(payload, "utf8").digest();
}

function merkleRoot(leaves: Buffer[]): Buffer {
  if (!leaves.length) return Buffer.alloc(32, 0);
  let level = leaves.slice();
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      next.push(crypto.createHash("sha256").update(Buffer.concat([left, right])).digest());
    }
    level = next;
  }
  return level[0];
}

async function publishToIpfsOrStub(filePath: string, cacheRootHex: string): Promise<{ cid: string; cidHashHex: string }> {
  if (!IPFS_API_URL) {
    const cid = `ipfs://stub/${cacheRootHex.slice(0, 32)}`;
    return { cid, cidHashHex: sha256Hex(cid) };
  }
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf]), path.basename(filePath));
  const endpoint = IPFS_API_URL.replace(/\/+$/, "") + "/api/v0/add?pin=true";
  const resp = await fetch(endpoint, { method: "POST", body: form as any });
  if (!resp.ok) throw new Error(`ipfs_add_failed_${resp.status}`);
  const text = await resp.text();
  const lines = text.trim().split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  const hash = String(last.Hash || "");
  if (!hash) throw new Error("ipfs_no_hash");
  const cid = `ipfs://${hash}`;
  return { cid, cidHashHex: sha256Hex(cid) };
}

async function setCacheHeadOnChain(
  parentHashHex: string,
  cacheRootHex: string,
  cidHashHex: string,
  epochId: number
) {
  if (!maybeProgramId || !maybeSigner) throw new Error("cache_head_program_or_signer_missing");
  const [cacheHeadPda] = PublicKey.findProgramAddressSync([Buffer.from("cache_head"), Buffer.from(parentHashHex, "hex")], maybeProgramId);

  const ixData = Buffer.concat([
    sighash("global:set_cache_head"),
    Buffer.from(parentHashHex, "hex"),
    Buffer.from(cacheRootHex, "hex"),
    Buffer.from(cidHashHex, "hex"),
    u64le(BigInt(epochId))
  ]);

  const ix = new TransactionInstruction({
    programId: maybeProgramId,
    keys: [
      { pubkey: cacheHeadPda, isSigner: false, isWritable: true },
      { pubkey: maybeSigner.publicKey, isSigner: true, isWritable: false }
    ],
    data: ixData
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = maybeSigner.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(maybeSigner);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(sig, "confirmed");
  return { tx: sig, cache_head_pda: cacheHeadPda.toBase58() };
}

async function maybeAwardRep(entries: CacheEntryV1[], epochId: number) {
  const repProgram = process.env.DDNS_REP_PROGRAM_ID || "";
  if (!repProgram || !maybeSigner) return { attempted: false, reason: "rep_not_configured" };
  const repProgramId = new PublicKey(repProgram);

  const byContributor = new Map<string, CacheEntryV1[]>();
  for (const e of entries) {
    const list = byContributor.get(e.witness_pubkey) || [];
    list.push(e);
    byContributor.set(e.witness_pubkey, list);
  }

  const out: Array<{ contributor: string; tx?: string; error?: string }> = [];
  for (const [witnessHex, list] of byContributor) {
    try {
      const contributor = new PublicKey(Buffer.from(witnessHex, "hex"));
      const uniqueNames = new Set(list.map((x) => x.name_hash)).size;
      const uniqueSources = 1;
      const avgConfidence = Math.floor(list.reduce((s, e) => s + e.confidence_bps, 0) / Math.max(1, list.length));
      const confidenceLevel = avgConfidence >= 9000 ? 2 : avgConfidence >= 7000 ? 1 : 0;

      const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_config")], repProgramId);
      const [repEpochPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("rep_epoch"), u64le(BigInt(epochId)), contributor.toBuffer()],
        repProgramId
      );

      const data = Buffer.concat([
        sighash("global:award_rep"),
        u64le(BigInt(epochId)),
        contributor.toBuffer(),
        u32le(list.length),
        u32le(uniqueNames),
        u16le(uniqueSources),
        Buffer.from([confidenceLevel])
      ]);

      const ix = new TransactionInstruction({
        programId: repProgramId,
        keys: [
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: repEpochPda, isSigner: false, isWritable: true },
          { pubkey: maybeSigner.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
        ],
        data
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = maybeSigner.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
      tx.sign(maybeSigner);
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");
      out.push({ contributor: contributor.toBase58(), tx: sig });
    } catch (err: any) {
      out.push({ contributor: witnessHex, error: String(err?.message || err) });
    }
  }

  return { attempted: true, awards: out };
}

function parseCacheHead(data: Buffer) {
  if (data.length < 8 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1) return null;
  let o = 8;
  const parent_name_hash = data.subarray(o, o + 32).toString("hex"); o += 32;
  const parent_owner = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
  const cache_root = data.subarray(o, o + 32).toString("hex"); o += 32;
  const cid_hash = data.subarray(o, o + 32).toString("hex"); o += 32;
  const updated_at_slot = Number(data.readBigUInt64LE(o)); o += 8;
  const epoch_id = Number(data.readBigUInt64LE(o)); o += 8;
  const enabled = data[o] === 1;
  return { parent_name_hash, parent_owner, cache_root, cid_hash, updated_at_slot, epoch_id, enabled };
}

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function sha256Hex(v: string): string {
  return crypto.createHash("sha256").update(v, "utf8").digest("hex");
}

function sighash(name: string): Buffer {
  const preimage = `anchor:${name}`;
  return crypto.createHash("sha256").update(preimage, "utf8").digest().subarray(0, 8);
}

function u16le(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v);
  return b;
}

function u32le(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
}

function u64le(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function hex32(v: string): string {
  return hexN(v, 64);
}

function hexN(v: string, len: number): string {
  const h = String(v || "").replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(h) || h.length !== len) throw new Error(`invalid_hex_${len}`);
  return h;
}

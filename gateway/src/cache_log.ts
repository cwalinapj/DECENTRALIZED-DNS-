import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export type CacheEntryV1 = {
  version: 1;
  name_hash: string; // hex
  parent_name_hash: string; // hex
  rrset_hash: string; // hex
  ttl_s: number;
  confidence_bps: number;
  observed_bucket: number;
  witness_pubkey: string; // hex32
  signature: string; // hex64
};

export type CacheLoggerConfig = {
  enabled: boolean;
  spoolPath: string;
  rollupUrl?: string;
  parentExtractRule: string;
  witnessPrivateKeyHex?: string;
};

export type CacheLogInput = {
  name: string;
  rrsetHashHex: string;
  ttlS: number;
  confidenceBps: number;
};

export function createCacheLogger(cfg: CacheLoggerConfig) {
  const enabled = cfg.enabled;
  if (!enabled) return { enabled: false, logEntry: async (_: CacheLogInput) => {} };

  const privateKey = parsePrivKey(cfg.witnessPrivateKeyHex || process.env.CACHE_WITNESS_PRIVATE_KEY_HEX || process.env.RESOLVER_PRIVATE_KEY_HEX || "");
  if (!privateKey) {
    console.warn("[cache-log] enabled but witness key missing; disabling cache log emission");
    return { enabled: false, logEntry: async (_: CacheLogInput) => {} };
  }
  const signerKey = privateKey;
  const witnessPub = Buffer.from(ed.getPublicKey(signerKey)).toString("hex");

  const spoolPath = cfg.spoolPath;
  fs.mkdirSync(path.dirname(spoolPath), { recursive: true });

  async function logEntry(input: CacheLogInput) {
    const normalizedName = normalizeName(input.name);
    const parent = extractPremiumParent(normalizedName, cfg.parentExtractRule);
    if (!parent) return;

    const nameHash = sha256Hex(normalizedName);
    const parentHash = sha256Hex(parent);
    const rrsetHash = strip0x(input.rrsetHashHex);
    if (rrsetHash.length !== 64) return;

    const observedBucket = Math.floor(Date.now() / 1000 / 600) * 600;
    const canonicalDigest = hashEntryForSignature({
      version: 1,
      nameHash,
      parentHash,
      rrsetHash,
      ttlS: Math.max(1, Math.floor(input.ttlS)),
      confidenceBps: clamp(Math.floor(input.confidenceBps), 0, 10000),
      observedBucket,
      witnessPub
    });
    const signature = Buffer.from(await ed.sign(canonicalDigest, signerKey)).toString("hex");

    const entry: CacheEntryV1 = {
      version: 1,
      name_hash: nameHash,
      parent_name_hash: parentHash,
      rrset_hash: rrsetHash,
      ttl_s: Math.max(1, Math.floor(input.ttlS)),
      confidence_bps: clamp(Math.floor(input.confidenceBps), 0, 10000),
      observed_bucket: observedBucket,
      witness_pubkey: witnessPub,
      signature
    };

    fs.appendFileSync(spoolPath, `${JSON.stringify(entry)}\n`, "utf8");

    if (cfg.rollupUrl) {
      try {
        await fetch(cfg.rollupUrl.replace(/\/+$/, "") + "/v1/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entries: [entry] })
        });
      } catch {
        // keep local spool authoritative in MVP
      }
    }
  }

  return { enabled: true, logEntry };
}

export function extractPremiumParent(name: string, rule = "last2-dns"): string | null {
  const n = normalizeName(name);
  if (!n.endsWith(".dns")) return null;
  const labels = n.split(".");
  if (rule === "last2-dns") {
    if (labels.length < 3) return null;
    return labels.slice(-2).join(".");
  }
  if (rule === "last2-any") {
    if (labels.length < 2) return null;
    return labels.slice(-2).join(".");
  }
  if (rule === "full") {
    return n;
  }
  return null;
}

export function computeRrsetHashFromAnswers(
  qname: string,
  qtype: string,
  answers: Array<{ name: string; type: string; data: string }>
): string {
  const norm = answers
    .map((a) => `${normalizeName(a.name || qname)}|${String(a.type || qtype).toUpperCase()}|${String(a.data || "").trim()}`)
    .filter((x) => !x.endsWith("|"))
    .sort();
  return sha256Hex(`${qtype.toUpperCase()}|${normalizeName(qname)}|${norm.join(",")}`);
}

function hashEntryForSignature(v: {
  version: number;
  nameHash: string;
  parentHash: string;
  rrsetHash: string;
  ttlS: number;
  confidenceBps: number;
  observedBucket: number;
  witnessPub: string;
}): Uint8Array {
  const domain = Buffer.from("DDNS_CACHE_ENTRY_V1", "utf8");
  const buf = Buffer.concat([
    domain,
    Buffer.from([v.version]),
    Buffer.from(v.nameHash, "hex"),
    Buffer.from(v.parentHash, "hex"),
    Buffer.from(v.rrsetHash, "hex"),
    u32le(v.ttlS),
    u16le(v.confidenceBps),
    u64le(BigInt(v.observedBucket)),
    Buffer.from(v.witnessPub, "hex")
  ]);
  return new Uint8Array(crypto.createHash("sha256").update(buf).digest());
}

function parsePrivKey(hex: string): Uint8Array | null {
  const h = strip0x(hex);
  if (h.length !== 64) return null;
  return new Uint8Array(Buffer.from(h, "hex"));
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\.+$/, "");
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function strip0x(v: string): string {
  return String(v || "").replace(/^0x/, "").toLowerCase();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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

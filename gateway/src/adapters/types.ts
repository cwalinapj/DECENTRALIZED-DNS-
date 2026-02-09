import crypto from "node:crypto";
import punycode from "punycode";

export type PolicyStatus = "OK" | "WARN" | "QUARANTINE";

export type RouteAnswer = {
  name: string;                 // normalized name
  nameHashHex: string;          // 0x... sha256(normalized_name)
  dest: string;                 // normalized destination string (url, ipfs://CID, etc). May be "" if unknown.
  destHashHex: string;          // 0x... sha256(normalized_dest)
  ttlS: number;
  source: {
    kind: "pkdns" | "ens" | "sns" | "handshake" | "ipfs" | "filecoin" | "arweave";
    ref: string;                // tx sig, PDA, chain height, record key, CID, etc.
    confidenceBps: number;      // 0..10000
    policy?: { status: PolicyStatus; flags: number; penaltyBps: number; recommendedTtlCap?: number };
  };
  proof: {
    type: "onchain" | "merkle" | "signature" | "none";
    payload: any;               // adapter-specific proof data (stable keys)
  };
};

export function normalizeNameForHash(name: string): string {
  // MVP: lowercase, strip trailing dot, punycode to ASCII.
  const trimmed = name.trim().replace(/\.$/, "");
  const lowered = trimmed.toLowerCase();
  return punycode.toASCII(lowered);
}

export function sha256Bytes(bytes: Uint8Array | Buffer | string): Buffer {
  const buf = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  return crypto.createHash("sha256").update(buf).digest();
}

export function sha256Hex(bytes: Uint8Array | Buffer | string): string {
  return `0x${sha256Bytes(bytes).toString("hex")}`;
}

export function nameHashBytes(name: string): Buffer {
  return sha256Bytes(normalizeNameForHash(name));
}

export function nameHashHex(name: string): string {
  return sha256Hex(normalizeNameForHash(name));
}

export function normalizeDest(dest: string): string {
  return dest.trim();
}

export function destHashHex(dest: string): string {
  return sha256Hex(normalizeDest(dest));
}


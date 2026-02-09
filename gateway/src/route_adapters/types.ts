import crypto from "node:crypto";
import { normalizeName } from "../registry.js";

export type PolicyStatus = "OK" | "WARN" | "QUARANTINE";

export type RouteAnswer = {
  name: string;        // normalized (punycoded where applicable)
  nameHashHex: string; // 0x... sha256(normalized_name)
  dest: string;        // normalized destination string (url, ipfs://CID, ar://tx, etc.)
  destHashHex: string; // 0x... sha256(normalized_dest)
  ttlS: number;
  source: {
    kind: "pkdns" | "ens" | "sns" | "handshake" | "ipfs" | "filecoin" | "arweave";
    ref: string;            // adapter-specific pointer (anchor root, tx, CID, key)
    confidenceBps: number;  // 0..10000
    policy?: { status: PolicyStatus; flags: number; penaltyBps: number; recommendedTtlCap?: number };
  };
  proof: {
    type: "onchain" | "merkle" | "signature" | "none";
    payload: any; // adapter-specific proof data; keep stable keys
  };
};

export function sha256Hex(bytes: Uint8Array | Buffer | string): string {
  const buf = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  return `0x${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

export function nameHashHex(name: string): string {
  const normalized = normalizeName(name);
  return sha256Hex(normalized);
}

export function destHashHex(dest: string): string {
  const normalized = dest.trim();
  return sha256Hex(normalized);
}


import type { RouteAdapter } from "./adapter.js";
import type { RouteAnswer } from "./types.js";
import { destHashHex, nameHashHex } from "./types.js";
import {
  buildMerkleRoot,
  buildProof,
  loadSnapshot,
  normalizeName,
  verifyProof,
} from "../registry.js";
import { loadAnchorStore } from "../anchor.js";
import { Connection, PublicKey } from "@solana/web3.js";
import crypto from "node:crypto";

type PkdnsConfig = {
  registryPath: string;
  anchorStorePath: string;
  policyProgramId?: string;
  solanaRpcUrl?: string;
};

type NamePolicyState = {
  status: "OK" | "WARN" | "QUARANTINE";
  confidenceBps: number;
  flags: number;
  penaltyBps: number;
  recommendedTtlCap?: number;
};

export function pkdnsAdapter(config: PkdnsConfig): RouteAdapter {
  return {
    kind: "pkdns",
    supports: (name) => normalizeName(name).endsWith(".dns"),
    resolve: async (name, opts) => resolvePkdns(name, config, opts)
  };
}

async function resolvePkdns(
  name: string,
  config: PkdnsConfig,
  opts: { timeoutMs: number }
): Promise<RouteAnswer | null> {
  const snapshot = loadSnapshot(config.registryPath);
  const normalized = normalizeName(name);
  const entry = snapshot.records.find((record) => normalizeName(record.name) === normalized);
  if (!entry) return null;

  // MVP: prefer ENDPOINT as the "destination".
  const endpoint = entry.records.find((r) => r.type.toUpperCase() === "ENDPOINT");
  if (!endpoint || typeof endpoint.value !== "string") {
    throw new Error("PKDNS_NO_ENDPOINT");
  }

  const ttlS = Math.max(30, Math.min(3600, Number(endpoint.ttl ?? 60)));

  const computedRoot = buildMerkleRoot(snapshot.records);
  const anchor = loadAnchorStore(config.anchorStorePath).latest;
  if (anchor && anchor.root !== computedRoot) {
    // If anchored root doesn't match the local snapshot, treat as unsafe.
    throw new Error("PKDNS_ANCHOR_MISMATCH");
  }
  const root = anchor?.root || computedRoot;

  const proof = buildProof(snapshot.records, normalized);
  if (proof.leaf && !verifyProof(root, proof.leaf, proof.proof)) {
    throw new Error("PKDNS_PROOF_INVALID");
  }

  const policy = await tryFetchPolicy(normalized, config, opts.timeoutMs);

  return {
    name: normalized,
    nameHashHex: nameHashHex(normalized),
    dest: endpoint.value,
    destHashHex: destHashHex(endpoint.value),
    ttlS,
    source: {
      kind: "pkdns",
      ref: anchor ? `anchor:${anchor.root}` : `merkle:${root}`,
      confidenceBps: 10000,
      ...(policy ? { policy } : {})
    },
    proof: {
      type: "merkle",
      payload: {
        registryVersion: snapshot.version,
        registryUpdatedAt: snapshot.updatedAt,
        root,
        leaf: proof.leaf,
        siblings: proof.proof.siblings,
        directions: proof.proof.directions,
        anchor: anchor ? { root: anchor.root, timestamp: anchor.timestamp, source: anchor.source } : null
      }
    }
  };
}

async function tryFetchPolicy(
  normalizedName: string,
  cfg: PkdnsConfig,
  timeoutMs: number
): Promise<NamePolicyState | null> {
  if (!cfg.policyProgramId || !cfg.solanaRpcUrl) return null;
  const programId = new PublicKey(cfg.policyProgramId);
  const nh = Buffer.from(normalizedName, "utf8");
  const nameHash = sha256Bytes(nh);
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("name_policy"), nameHash], programId);
  const conn = new Connection(cfg.solanaRpcUrl, "confirmed");
  const info = await withTimeout(conn.getAccountInfo(pda, "confirmed"), timeoutMs);
  if (!info?.data) return null;
  try {
    const decoded = decodeNamePolicyState(info.data);
    return decoded;
  } catch {
    return null;
  }
}

function decodeNamePolicyState(buf: Buffer): NamePolicyState {
  // Anchor account: 8-byte discriminator prefix.
  let off = 8;
  off += 32; // name_hash
  const statusU8 = buf.readUInt8(off); off += 1;
  const confidenceBps = buf.readUInt16LE(off); off += 2;
  const reasonFlags = buf.readUInt32LE(off); off += 4;
  off += 8; // last_updated_unix (i64)
  off += 8; // last_epoch_id (u64)
  off += 4; // rolling_ok (u32)
  off += 4; // rolling_fail (u32)
  off += 4; // rolling_mismatch (u32)
  off += 2; // distinct_watchdogs_last_epoch (u16)
  const penaltyBps = buf.readUInt16LE(off); off += 2;
  const recommendedTtlCap = buf.readUInt32LE(off); off += 4;

  const status: NamePolicyState["status"] =
    statusU8 === 2 ? "QUARANTINE" : statusU8 === 1 ? "WARN" : "OK";

  return {
    status,
    confidenceBps,
    flags: reasonFlags,
    penaltyBps,
    ...(recommendedTtlCap ? { recommendedTtlCap } : {})
  };
}

function sha256Bytes(bytes: Buffer): Buffer {
  return crypto.createHash("sha256").update(bytes).digest();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timer]);
  } finally {
    clearTimeout(timeout!);
  }
}

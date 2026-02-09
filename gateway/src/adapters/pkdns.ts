import { Connection, PublicKey } from "@solana/web3.js";
import type { Adapter } from "./shim.js";
import { nameHashBytes, nameHashHex, normalizeDest, normalizeNameForHash, sha256Bytes } from "./types.js";

export type PkdnsAdapterConfig = {
  solanaRpcUrl: string;
  ddnsRegistryProgramId: string; // ddns_registry
  ddnsWatchdogPolicyProgramId?: string; // optional
};

export type CanonicalDestHash = {
  programId: PublicKey;
  canonicalPda: PublicKey;
  slot: number;
  decoded: CanonicalRouteDecoded;
  canonical: {
    programId: string;
    canonicalPda: string;
    destHashHex: string;
    ttlS: number;
    updatedAtSlot: string;
  };
};

export function createPkdnsAdapter(cfg: PkdnsAdapterConfig): Adapter {
  return {
    kind: "pkdns",
    async resolve(input) {
      const rawName = input?.name ?? "";
      if (!rawName) return null;
      const normalized = normalizeNameForHash(rawName);
      if (!normalized.endsWith(".dns")) return null;

      if (!cfg.ddnsRegistryProgramId) {
        throw new Error("DDNS_REGISTRY_PROGRAM_ID_MISSING");
      }

      const connection: Connection = input?.opts?.solanaConnection || new Connection(cfg.solanaRpcUrl, "confirmed");
      const timeoutMs = Number(input?.opts?.timeoutMs ?? 5000);

      const canonical = await getCanonicalDestHash({ cfg, name: normalized, connection });
      if (!canonical) return null;

      const policy = await tryFetchPolicy(connection, cfg, nameHashBytes(normalized), timeoutMs);

      const destFromQuery = typeof input?.opts?.dest === "string" ? input.opts.dest : undefined;
      const witnessUrl = typeof input?.opts?.witnessUrl === "string" ? input.opts.witnessUrl : undefined;
      const destCandidate =
        destFromQuery && destFromQuery.trim()
          ? destFromQuery
          : witnessUrl
            ? await tryFetchWitnessDest(witnessUrl, normalized, timeoutMs)
            : undefined;

      if (destCandidate && destCandidate.trim()) {
        return verifyCandidateDest({
          cfg,
          name: normalized,
          dest: destCandidate,
          connection,
          canonicalOverride: canonical,
          policy
        });
      }

      // Hash-only canonical state: return a verifier-style answer with canonical evidence and a clear error.
      return {
        name: normalized,
        nameHashHex: nameHashHex(normalized),
        dest: null,
        destHashHex: canonical.canonical.destHashHex,
        ttlS: canonical.canonical.ttlS,
        verified: false,
        canonical: canonical.canonical,
        error: {
          code: "DEST_REQUIRED",
          message: "PKDNS canonical route stores dest_hash only. Supply ?dest=... to verify, or configure DDNS_WITNESS_URL for resolve+verify."
        },
        source: {
          kind: "pkdns",
          ref: canonical.canonicalPda.toBase58(),
          confidenceBps: 10000,
          ...(policy ? { policy } : {})
        },
        proof: {
          type: "onchain",
          payload: {
            programId: canonical.programId.toBase58(),
            canonicalPda: canonical.canonicalPda.toBase58(),
            slot: canonical.slot,
            fields: {
              nameHashHex: `0x${Buffer.from(canonical.decoded.nameHash).toString("hex")}`,
              destHashHex: canonical.canonical.destHashHex,
              ttlS: canonical.canonical.ttlS,
              version: canonical.decoded.version.toString(),
              updatedAtSlot: canonical.decoded.updatedAtSlot.toString(),
              lastAggregate: canonical.decoded.lastAggregate.toBase58(),
              bump: canonical.decoded.bump
            }
          }
        }
      };
    }
  };
}

export async function getCanonicalDestHash(params: {
  cfg: PkdnsAdapterConfig;
  name: string;
  connection: Connection;
}): Promise<CanonicalDestHash | null> {
  const normalized = normalizeNameForHash(params.name);
  if (!normalized.endsWith(".dns")) return null;
  const programId = new PublicKey(params.cfg.ddnsRegistryProgramId);

  const nameHash = nameHashBytes(normalized);
  const [canonicalPda] = PublicKey.findProgramAddressSync([Buffer.from("canonical"), nameHash], programId);

  const ctx = await params.connection.getAccountInfoAndContext(canonicalPda, "confirmed");
  const slot = ctx.context.slot;
  const info = ctx.value;
  if (!info?.data) return null;

  const decoded = decodeCanonicalRoute(info.data);
  if (!Buffer.from(decoded.nameHash).equals(nameHash)) throw new Error("PKDNS_NAME_HASH_MISMATCH");

  return {
    programId,
    canonicalPda,
    slot,
    decoded,
    canonical: {
      programId: programId.toBase58(),
      canonicalPda: canonicalPda.toBase58(),
      destHashHex: `0x${Buffer.from(decoded.destHash).toString("hex")}`,
      ttlS: decoded.ttlS,
      updatedAtSlot: decoded.updatedAtSlot.toString()
    }
  };
}

export async function verifyCandidateDest(params: {
  cfg: PkdnsAdapterConfig;
  name: string;
  dest: string;
  connection: Connection;
  canonicalOverride?: CanonicalDestHash;
  policy?: any;
}): Promise<import("./types.js").RouteAnswer> {
  const normalized = normalizeNameForHash(params.name);
  const canonical = params.canonicalOverride || (await getCanonicalDestHash({ cfg: params.cfg, name: normalized, connection: params.connection }));
  if (!canonical) throw new Error("NOT_FOUND");

  const destNormalized = normalizeDest(params.dest);
  const dh = sha256Bytes(destNormalized);
  const ok = Buffer.from(canonical.decoded.destHash).equals(dh);

  return {
    name: normalized,
    nameHashHex: nameHashHex(normalized),
    dest: ok ? destNormalized : null,
    destHashHex: canonical.canonical.destHashHex,
    ttlS: canonical.canonical.ttlS,
    verified: ok,
    canonical: canonical.canonical,
    ...(ok
      ? {}
      : {
          error: {
            code: "DEST_HASH_MISMATCH",
            message: "Candidate dest does not match canonical dest_hash."
          }
        }),
    source: {
      kind: "pkdns",
      ref: canonical.canonicalPda.toBase58(),
      confidenceBps: ok ? 10000 : 5000,
      ...(params.policy ? { policy: params.policy } : {})
    },
    proof: {
      type: "onchain",
      payload: {
        programId: canonical.programId.toBase58(),
        canonicalPda: canonical.canonicalPda.toBase58(),
        slot: canonical.slot,
        candidateDest: ok ? destNormalized : undefined,
        candidateDestHashHex: `0x${dh.toString("hex")}`,
        fields: {
          nameHashHex: `0x${Buffer.from(canonical.decoded.nameHash).toString("hex")}`,
          destHashHex: canonical.canonical.destHashHex,
          ttlS: canonical.canonical.ttlS,
          version: canonical.decoded.version.toString(),
          updatedAtSlot: canonical.decoded.updatedAtSlot.toString(),
          lastAggregate: canonical.decoded.lastAggregate.toBase58(),
          bump: canonical.decoded.bump
        }
      }
    }
  };
}

type CanonicalRouteDecoded = {
  nameHash: Uint8Array;
  destHash: Uint8Array;
  ttlS: number;
  version: bigint;
  updatedAtSlot: bigint;
  lastAggregate: PublicKey;
  bump: number;
};

function decodeCanonicalRoute(data: Buffer | Uint8Array): CanonicalRouteDecoded {
  const buf = Buffer.from(data);
  let off = 8; // anchor discriminator
  const nameHash = buf.subarray(off, off + 32); off += 32;
  const destHash = buf.subarray(off, off + 32); off += 32;
  const ttlS = buf.readUInt32LE(off); off += 4;
  const version = buf.readBigUInt64LE(off); off += 8;
  const updatedAtSlot = buf.readBigUInt64LE(off); off += 8;
  const lastAggregate = new PublicKey(buf.subarray(off, off + 32)); off += 32;
  const bump = buf.readUInt8(off); off += 1;
  return { nameHash, destHash, ttlS, version, updatedAtSlot, lastAggregate, bump };
}

async function tryFetchPolicy(
  connection: Connection,
  cfg: PkdnsAdapterConfig,
  nameHash: Buffer,
  timeoutMs: number
) {
  if (!cfg.ddnsWatchdogPolicyProgramId) return null;
  const programId = new PublicKey(cfg.ddnsWatchdogPolicyProgramId);
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("name_policy"), nameHash], programId);
  try {
    const ctx = await withTimeout(connection.getAccountInfoAndContext(pda, "confirmed"), timeoutMs);
    if (!ctx.value?.data) return null;
    return decodeNamePolicyState(ctx.value.data);
  } catch {
    return null;
  }
}

function buildWitnessUrl(base: string, name: string): string {
  // DDNS_WITNESS_URL is treated as a full endpoint URL; we append `?name=...` if needed.
  const hasQuery = base.includes("?");
  return `${base}${hasQuery ? "&" : "?"}name=${encodeURIComponent(name)}`;
}

async function tryFetchWitnessDest(witnessUrl: string, name: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = buildWitnessUrl(witnessUrl, name);
    const res = await fetch(url, { method: "GET", headers: { "accept": "application/json" }, signal: controller.signal });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json || typeof json.dest !== "string") return null;
    return json.dest;
  } catch (err: any) {
    if (err?.name === "AbortError") return null;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeNamePolicyState(data: Buffer | Uint8Array) {
  const buf = Buffer.from(data);
  let off = 8; // discriminator
  off += 32; // name_hash
  const statusU8 = buf.readUInt8(off); off += 1;
  const confidenceBps = buf.readUInt16LE(off); off += 2;
  const flags = buf.readUInt32LE(off); off += 4;
  off += 8; // last_updated_unix
  off += 8; // last_epoch_id
  off += 4; // rolling_ok
  off += 4; // rolling_fail
  off += 4; // rolling_mismatch
  off += 2; // distinct_watchdogs_last_epoch
  const penaltyBps = buf.readUInt16LE(off); off += 2;
  const recommendedTtlCap = buf.readUInt32LE(off); off += 4;
  const status = statusU8 === 2 ? "QUARANTINE" : statusU8 === 1 ? "WARN" : "OK";
  return {
    status: status as "OK" | "WARN" | "QUARANTINE",
    confidenceBps,
    flags,
    penaltyBps,
    ...(recommendedTtlCap ? { recommendedTtlCap } : {})
  };
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

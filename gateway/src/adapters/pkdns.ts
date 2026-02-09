import { Connection, PublicKey } from "@solana/web3.js";
import type { Adapter } from "./shim.js";
import { nameHashBytes, nameHashHex, normalizeDest, normalizeNameForHash, sha256Bytes } from "./types.js";

export type PkdnsAdapterConfig = {
  solanaRpcUrl: string;
  ddnsRegistryProgramId: string; // ddns_registry
  ddnsWatchdogPolicyProgramId?: string; // optional
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

      const programId = new PublicKey(cfg.ddnsRegistryProgramId);
      const connection: Connection = input?.opts?.solanaConnection || new Connection(cfg.solanaRpcUrl, "confirmed");

      const nameHash = nameHashBytes(normalized);
      const [canonicalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("canonical"), nameHash],
        programId
      );

      const ctx = await connection.getAccountInfoAndContext(canonicalPda, "confirmed");
      const slot = ctx.context.slot;
      const info = ctx.value;
      if (!info?.data) return null;

      const decoded = decodeCanonicalRoute(info.data);
      // Defensive: ensure on-chain name_hash matches computed hash.
      if (!Buffer.from(decoded.nameHash).equals(nameHash)) {
        throw new Error("PKDNS_NAME_HASH_MISMATCH");
      }

      // MVP: chain stores dest_hash only. dest string is optional (proof-of-observation off-chain).
      const destOverride = typeof input?.opts?.dest === "string" ? input.opts.dest : "";
      let dest = "";
      if (destOverride) {
        const dh = sha256Bytes(normalizeDest(destOverride));
        if (Buffer.from(decoded.destHash).equals(dh)) {
          dest = normalizeDest(destOverride);
        }
      }

      const policy = await tryFetchPolicy(connection, cfg, nameHash, Number(input?.opts?.timeoutMs ?? 5000));

      return {
        name: normalized,
        nameHashHex: nameHashHex(normalized),
        dest,
        destHashHex: `0x${Buffer.from(decoded.destHash).toString("hex")}`,
        ttlS: decoded.ttlS,
        source: {
          kind: "pkdns",
          ref: canonicalPda.toBase58(),
          confidenceBps: 10000,
          ...(policy ? { policy } : {})
        },
        proof: {
          type: "onchain",
          payload: {
            programId: programId.toBase58(),
            canonicalPda: canonicalPda.toBase58(),
            slot,
            fields: {
              nameHashHex: `0x${Buffer.from(decoded.nameHash).toString("hex")}`,
              destHashHex: `0x${Buffer.from(decoded.destHash).toString("hex")}`,
              ttlS: decoded.ttlS,
              version: decoded.version.toString(),
              updatedAtSlot: decoded.updatedAtSlot.toString(),
              lastAggregate: decoded.lastAggregate.toBase58(),
              bump: decoded.bump
            },
            accountDataBase64: Buffer.from(info.data).toString("base64")
          }
        }
      };
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

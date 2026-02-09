import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createPkdnsAdapter } from "../src/adapters/pkdns.js";
import { nameHashBytes, normalizeDest, sha256Bytes } from "../src/adapters/types.js";

function encodeCanonicalRoute(params: {
  nameHash: Buffer;
  destHash: Buffer;
  ttlS?: number;
  version?: bigint;
  updatedAtSlot?: bigint;
  lastAggregate?: PublicKey;
  bump?: number;
}): Buffer {
  const ttlS = params.ttlS ?? 300;
  const version = params.version ?? 1n;
  const updatedAtSlot = params.updatedAtSlot ?? 1234n;
  const lastAggregate = params.lastAggregate ?? Keypair.generate().publicKey;
  const bump = params.bump ?? 255;

  const buf = Buffer.alloc(8 + 32 + 32 + 4 + 8 + 8 + 32 + 1);
  let off = 0;
  buf.fill(0, off, off + 8); off += 8; // discriminator (ignored in decode)
  params.nameHash.copy(buf, off); off += 32;
  params.destHash.copy(buf, off); off += 32;
  buf.writeUInt32LE(ttlS, off); off += 4;
  buf.writeBigUInt64LE(version, off); off += 8;
  buf.writeBigUInt64LE(updatedAtSlot, off); off += 8;
  lastAggregate.toBuffer().copy(buf, off); off += 32;
  buf.writeUInt8(bump, off); off += 1;
  return buf;
}

describe("pkdns adapter (verify vs resolve+verify)", () => {
  beforeEach(() => {
    // default fetch is unused unless witnessUrl is set
    // @ts-expect-error test override
    globalThis.fetch = vi.fn();
  });

  it("verifyCandidateDest returns verified=true when candidate dest matches canonical dest_hash", async () => {
    const programId = Keypair.generate().publicKey.toBase58();
    const adapter = createPkdnsAdapter({ solanaRpcUrl: "http://localhost", ddnsRegistryProgramId: programId });

    const name = "alice.dns";
    const dest = "https://example.com";
    const nameHash = nameHashBytes(name);
    const destHash = sha256Bytes(normalizeDest(dest));
    const accountData = encodeCanonicalRoute({ nameHash, destHash, ttlS: 300 });

    const connection = {
      getAccountInfoAndContext: async () => ({
        context: { slot: 9999 },
        value: { data: accountData }
      })
    };

    const ans = await adapter.resolve({ name, opts: { dest, solanaConnection: connection } });
    expect(ans).toBeTruthy();
    expect(ans!.source.kind).toBe("pkdns");
    expect(ans!.verified).toBe(true);
    expect(ans!.dest).toBe(dest);
    expect(ans!.error).toBeUndefined();
    expect(ans!.canonical?.destHashHex).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("resolve+verify uses witnessUrl when dest is not provided", async () => {
    const programId = Keypair.generate().publicKey.toBase58();
    const adapter = createPkdnsAdapter({ solanaRpcUrl: "http://localhost", ddnsRegistryProgramId: programId });

    const name = "alice.dns";
    const dest = "https://example.com";
    const nameHash = nameHashBytes(name);
    const destHash = sha256Bytes(normalizeDest(dest));
    const accountData = encodeCanonicalRoute({ nameHash, destHash, ttlS: 300 });

    const connection = {
      getAccountInfoAndContext: async () => ({
        context: { slot: 9999 },
        value: { data: accountData }
      })
    };

    // @ts-expect-error mock fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ dest, ttl_s: 300 })
    }));

    const ans = await adapter.resolve({ name, opts: { witnessUrl: "http://witness.local/v1/witness", solanaConnection: connection } });
    expect(ans).toBeTruthy();
    expect(ans!.verified).toBe(true);
    expect(ans!.dest).toBe(dest);
  });

  it("returns verified=false with a clear error when candidate dest mismatches canonical dest_hash", async () => {
    const programId = Keypair.generate().publicKey.toBase58();
    const adapter = createPkdnsAdapter({ solanaRpcUrl: "http://localhost", ddnsRegistryProgramId: programId });

    const name = "alice.dns";
    const canonicalDest = "https://example.com";
    const wrongDest = "https://evil.example";
    const nameHash = nameHashBytes(name);
    const destHash = sha256Bytes(normalizeDest(canonicalDest));
    const accountData = encodeCanonicalRoute({ nameHash, destHash, ttlS: 300 });

    const connection = {
      getAccountInfoAndContext: async () => ({
        context: { slot: 9999 },
        value: { data: accountData }
      })
    };

    const ans = await adapter.resolve({ name, opts: { dest: wrongDest, solanaConnection: connection } });
    expect(ans).toBeTruthy();
    expect(ans!.verified).toBe(false);
    expect(ans!.dest).toBeNull();
    expect(ans!.error?.code).toBe("DEST_HASH_MISMATCH");
  });
});


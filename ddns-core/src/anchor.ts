import { blake3 } from "@noble/hashes/blake3";
import { ascii, concatBytes, readU32le, readU64le, u32le, u64le } from "./bytes.js";
import { ed25519Sign, ed25519Verify } from "./crypto_ed25519.js";
import { routesetHash } from "./routeset.js";

export interface AnchorV1 {
  ns_id: number;           // u32
  name_id: Uint8Array;     // 32
  seq: bigint;             // u64
  exp: bigint;             // u64
  routeset_hash: Uint8Array; // 32
  owner_pub: Uint8Array;   // 32
  sig?: Uint8Array;        // 64
}

const MAGIC = ascii("ANCH");
const VERSION = 1;
export const ANCHOR_V1_LEN = 217;

export function encodeAnchorV1(a: AnchorV1): Uint8Array {
  if (!Number.isInteger(a.ns_id) || a.ns_id < 0 || a.ns_id > 0xffffffff) throw new Error("ns_id out of range");
  if (a.name_id.length !== 32) throw new Error("name_id must be 32 bytes");
  if (a.routeset_hash.length !== 32) throw new Error("routeset_hash must be 32 bytes");
  if (a.owner_pub.length !== 32) throw new Error("owner_pub must be 32 bytes");
  if (a.sig && a.sig.length !== 64) throw new Error("sig must be 64 bytes");

  const withoutSig = concatBytes(
    MAGIC,
    new Uint8Array([VERSION]),
    u32le(a.ns_id >>> 0),
    a.name_id,
    u64le(a.seq),
    u64le(a.exp),
    a.routeset_hash,
    a.owner_pub
  );

  return a.sig ? concatBytes(withoutSig, a.sig) : withoutSig;
}

export function decodeAnchorV1(bytes: Uint8Array): AnchorV1 {
  if (bytes.length < (ANCHOR_V1_LEN - 64)) throw new Error("anchor too short");
  let off = 0;
  const magic = bytes.slice(off, off + 4); off += 4;
  if (ascii("ANCH").some((b, i) => magic[i] !== b)) throw new Error("bad magic");
  const version = bytes[off++]; if (version !== 1) throw new Error("bad version");

  const ns_id = readU32le(bytes, off); off += 4;
  const name_id = bytes.slice(off, off + 32); off += 32;
  const seq = readU64le(bytes, off); off += 8;
  const exp = readU64le(bytes, off); off += 8;
  const routeset_hash = bytes.slice(off, off + 32); off += 32;
  const owner_pub = bytes.slice(off, off + 32); off += 32;
  const sig = (off + 64 <= bytes.length) ? bytes.slice(off, off + 64) : undefined;

  return { ns_id, name_id, seq, exp, routeset_hash, owner_pub, sig };
}

export async function buildAnchorV1(params: Omit<AnchorV1, "sig">, privSeed32: Uint8Array): Promise<Uint8Array> {
  const noSigBytes = encodeAnchorV1({ ...params });
  const sig = await ed25519Sign(privSeed32, noSigBytes);
  return encodeAnchorV1({ ...params, sig });
}

export async function verifyAnchorV1(anchorBytes: Uint8Array, { requireLength = true }: { requireLength?: boolean } = {}): Promise<boolean> {
  if (requireLength && anchorBytes.length !== ANCHOR_V1_LEN) return false;
  const a = decodeAnchorV1(anchorBytes);
  if (!a.sig) return false;
  const payload = anchorBytes.slice(0, anchorBytes.length - 64);
  return await ed25519Verify(a.owner_pub, payload, a.sig);
}

export function anchorHash(anchorBytes: Uint8Array): Uint8Array {
  return blake3(anchorBytes, { dkLen: 32 });
}

export function anchorMatchesRouteSet(anchorBytes: Uint8Array, routesetBytes: Uint8Array): boolean {
  const a = decodeAnchorV1(anchorBytes);
  const h = routesetHash(routesetBytes);
  for (let i = 0; i < 32; i++) if (a.routeset_hash[i] !== h[i]) return false;
  return true;
}

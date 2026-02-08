import { blake3 } from "@noble/hashes/blake3";
import { ascii, concatBytes, readU16le, readU32le, readU64le, u16le, u32le, u64le } from "./bytes.js";
import { ed25519Sign, ed25519Verify } from "./crypto_ed25519.js";

export type RRType = number;  // DNS type code
export type RRClass = number; // usually 1

export interface RecordV1 {
  rr_type: RRType;
  rr_class: RRClass; // normally 1
  ttl: number; // u32
  rdata: Uint8Array; // length-delimited
}

export interface RouteSetV1 {
  ns_id: number;          // u32
  name_id: Uint8Array;    // 32
  seq: bigint;            // u64
  exp: bigint;            // u64 unix seconds
  records: RecordV1[];
  owner_pub: Uint8Array;  // 32
  sig?: Uint8Array;       // 64
}

const MAGIC = ascii("RSET");
const VERSION = 1;

function sortRecordsCanonical(recs: RecordV1[]): RecordV1[] {
  // Sort by (type, ttl, rdata_bytes) ascending bytewise
  return [...recs].sort((a, b) => {
    if (a.rr_type !== b.rr_type) return a.rr_type - b.rr_type;
    if (a.ttl !== b.ttl) return a.ttl - b.ttl;
    const al = a.rdata.length, bl = b.rdata.length;
    const m = Math.min(al, bl);
    for (let i = 0; i < m; i++) {
      const d = a.rdata[i] - b.rdata[i];
      if (d !== 0) return d;
    }
    return al - bl;
  });
}

export function encodeRouteSetV1(rs: RouteSetV1, { canonicalize = true }: { canonicalize?: boolean } = {}): Uint8Array {
  if (rs.name_id.length !== 32) throw new Error("name_id must be 32 bytes");
  if (rs.owner_pub.length !== 32) throw new Error("owner_pub must be 32 bytes");
  if (!Number.isInteger(rs.ns_id) || rs.ns_id < 0 || rs.ns_id > 0xffffffff) throw new Error("ns_id out of range");
  if (rs.sig && rs.sig.length !== 64) throw new Error("sig must be 64 bytes");

  const records = canonicalize ? sortRecordsCanonical(rs.records) : rs.records;

  const recParts: Uint8Array[] = [];
  for (const r of records) {
    if (!Number.isInteger(r.rr_type) || r.rr_type < 0 || r.rr_type > 0xffff) throw new Error("rr_type out of range");
    if (!Number.isInteger(r.rr_class) || r.rr_class < 0 || r.rr_class > 0xffff) throw new Error("rr_class out of range");
    if (!Number.isInteger(r.ttl) || r.ttl < 0 || r.ttl > 0xffffffff) throw new Error("ttl out of range");
    if (r.rdata.length > 0xffff) throw new Error("rdata too long");
    recParts.push(
      u16le(r.rr_type),
      u16le(r.rr_class),
      u32le(r.ttl >>> 0),
      u16le(r.rdata.length),
      r.rdata
    );
  }

  const header = concatBytes(
    MAGIC,
    new Uint8Array([VERSION]),
    u32le(rs.ns_id >>> 0),
    rs.name_id,
    u64le(rs.seq),
    u64le(rs.exp),
    u32le(records.length >>> 0)
  );

  const body = concatBytes(...recParts, rs.owner_pub);

  const withoutSig = concatBytes(header, body);
  if (!rs.sig) return withoutSig;

  return concatBytes(withoutSig, rs.sig);
}

export function decodeRouteSetV1(bytes: Uint8Array): RouteSetV1 {
  if (bytes.length < 4 + 1 + 4 + 32 + 8 + 8 + 4 + 32 + 64) {
    // minimal with 0 records still needs owner_pub + sig
    // but allow “unsigned” decode too; just ensure header exists
  }
  let off = 0;
  const magic = bytes.slice(off, off + 4); off += 4;
  if (ascii("RSET").some((b, i) => magic[i] !== b)) throw new Error("bad magic");
  const version = bytes[off++]; if (version !== 1) throw new Error("bad version");
  const ns_id = readU32le(bytes, off); off += 4;
  const name_id = bytes.slice(off, off + 32); off += 32;
  const seq = readU64le(bytes, off); off += 8;
  const exp = readU64le(bytes, off); off += 8;
  const record_count = readU32le(bytes, off); off += 4;

  const records: RecordV1[] = [];
  for (let i = 0; i < record_count; i++) {
    const rr_type = readU16le(bytes, off); off += 2;
    const rr_class = readU16le(bytes, off); off += 2;
    const ttl = readU32le(bytes, off); off += 4;
    const rlen = readU16le(bytes, off); off += 2;
    const rdata = bytes.slice(off, off + rlen); off += rlen;
    records.push({ rr_type, rr_class, ttl, rdata });
  }

  const owner_pub = bytes.slice(off, off + 32); off += 32;
  const sig = (off + 64 <= bytes.length) ? bytes.slice(off, off + 64) : undefined;

  return { ns_id, name_id, seq, exp, records, owner_pub, sig };
}

export function routesetHash(routesetBytes: Uint8Array): Uint8Array {
  return blake3(routesetBytes, { dkLen: 32 });
}

export async function signRouteSetV1(unsigned: Omit<RouteSetV1, "sig">, privSeed32: Uint8Array): Promise<RouteSetV1> {
  const bytesNoSig = encodeRouteSetV1({ ...unsigned }, { canonicalize: true });
  const sig = await ed25519Sign(privSeed32, bytesNoSig);
  return { ...unsigned, sig };
}

export async function verifyRouteSetV1(routesetBytes: Uint8Array, { requireCanonical = false }: { requireCanonical?: boolean } = {}): Promise<boolean> {
  const rs = decodeRouteSetV1(routesetBytes);
  if (!rs.sig) return false;

  // Optional: enforce canonical encoding by re-encoding and comparing bytes.
  if (requireCanonical) {
    const recoded = encodeRouteSetV1({ ...rs, sig: rs.sig }, { canonicalize: true });
    if (recoded.length !== routesetBytes.length) return false;
    for (let i = 0; i < recoded.length; i++) if (recoded[i] !== routesetBytes[i]) return false;
  }

  const payload = routesetBytes.slice(0, routesetBytes.length - 64);
  return await ed25519Verify(rs.owner_pub, payload, rs.sig);
}

import { ascii, concatBytes, readU16le, readU32le, readU64le, u16le, u32le, u64le } from "./bytes.js";

/**
 * Wire Protocol v1 (specs/protocol/wire-v1.md)
 *
 * Header is fixed 24 bytes:
 * magic(4)="DDNS", version(1)=1, msg_type(1), flags(2), req_id(4),
 * ns_id(4), payload_len(4), reserved(4)=0
 *
 * All integers little-endian.
 */

export const WIRE_MAGIC = ascii("DDNS");
export const WIRE_VERSION = 1;
export const WIRE_HEADER_LEN = 24;

// Flags (u16)
export const F_WANT_ANCHOR = 1 << 0;
export const F_NO_CACHE = 1 << 1;
export const F_TRUNCATED = 1 << 2;

// Message types (u8)
export enum MsgType {
  QRY = 1,
  ANS = 2,
  ANC = 3,
  NOT = 4,
  GSP = 5,
  GET = 6,
  PUT = 7
}

export interface WireHeader {
  version: number; // u8
  msg_type: number; // u8
  flags: number; // u16
  req_id: number; // u32
  ns_id: number; // u32
  payload_len: number; // u32
  reserved?: number; // u32, must be 0 on encode
}

export interface WirePacket {
  header: WireHeader;
  payload: Uint8Array;
}

/** Encode a header. payload_len must match payload bytes you attach. */
export function encodeHeader(h: WireHeader): Uint8Array {
  if (h.version !== WIRE_VERSION) throw new Error("unsupported wire version");
  if (!Number.isInteger(h.msg_type) || h.msg_type < 0 || h.msg_type > 0xff) throw new Error("msg_type out of range");
  if (!Number.isInteger(h.flags) || h.flags < 0 || h.flags > 0xffff) throw new Error("flags out of range");
  if (!Number.isInteger(h.req_id) || h.req_id < 0 || h.req_id > 0xffffffff) throw new Error("req_id out of range");
  if (!Number.isInteger(h.ns_id) || h.ns_id < 0 || h.ns_id > 0xffffffff) throw new Error("ns_id out of range");
  if (!Number.isInteger(h.payload_len) || h.payload_len < 0 || h.payload_len > 0xffffffff) throw new Error("payload_len out of range");

  const reserved = 0;
  return concatBytes(
    WIRE_MAGIC,
    new Uint8Array([h.version & 0xff]),
    new Uint8Array([h.msg_type & 0xff]),
    u16le(h.flags),
    u32le(h.req_id >>> 0),
    u32le(h.ns_id >>> 0),
    u32le(h.payload_len >>> 0),
    u32le(reserved)
  );
}

export function decodeHeader(bytes: Uint8Array): WireHeader {
  if (bytes.length < WIRE_HEADER_LEN) throw new Error("short header");
  for (let i = 0; i < 4; i++) if (bytes[i] !== WIRE_MAGIC[i]) throw new Error("bad magic");

  const version = bytes[4];
  if (version !== WIRE_VERSION) throw new Error("bad version");

  const msg_type = bytes[5];
  const flags = readU16le(bytes, 6);
  const req_id = readU32le(bytes, 8);
  const ns_id = readU32le(bytes, 12);
  const payload_len = readU32le(bytes, 16);
  const reserved = readU32le(bytes, 20);
  if (reserved !== 0) throw new Error("reserved must be zero");

  return { version, msg_type, flags, req_id, ns_id, payload_len, reserved };
}

export function encodePacket(packet: WirePacket): Uint8Array {
  const payload = packet.payload ?? new Uint8Array();
  const headerBytes = encodeHeader({ ...packet.header, payload_len: payload.length });
  return concatBytes(headerBytes, payload);
}

export function decodePacket(bytes: Uint8Array): WirePacket {
  const header = decodeHeader(bytes);
  const total = WIRE_HEADER_LEN + header.payload_len;
  if (bytes.length < total) throw new Error("packet truncated");
  const payload = bytes.slice(WIRE_HEADER_LEN, total);
  return { header, payload };
}

/* -----------------------------
 * Payload codecs (v1)
 * ----------------------------- */

export interface QryPayload {
  name_id: Uint8Array; // 32
  qtype: number; // u16
  min_seq: bigint; // u64
}

export function encodeQRY(p: QryPayload): Uint8Array {
  if (p.name_id.length !== 32) throw new Error("name_id must be 32 bytes");
  if (!Number.isInteger(p.qtype) || p.qtype < 0 || p.qtype > 0xffff) throw new Error("qtype out of range");
  return concatBytes(p.name_id, u16le(p.qtype), u64le(p.min_seq));
}

export function decodeQRY(bytes: Uint8Array): QryPayload {
  if (bytes.length !== 32 + 2 + 8) throw new Error("bad QRY length");
  const name_id = bytes.slice(0, 32);
  const qtype = readU16le(bytes, 32);
  const min_seq = readU64le(bytes, 34);
  return { name_id, qtype, min_seq };
}

export interface AnsPayload {
  status: number; // u8
  routeset: Uint8Array;
}

export function encodeANS(p: AnsPayload): Uint8Array {
  if (!Number.isInteger(p.status) || p.status < 0 || p.status > 0xff) throw new Error("status out of range");
  if (p.routeset.length > 0xffffffff) throw new Error("routeset too large");
  return concatBytes(new Uint8Array([p.status & 0xff]), u32le(p.routeset.length >>> 0), p.routeset);
}

export function decodeANS(bytes: Uint8Array): AnsPayload {
  if (bytes.length < 1 + 4) throw new Error("bad ANS length");
  const status = bytes[0];
  const len = readU32le(bytes, 1);
  if (bytes.length !== 1 + 4 + len) throw new Error("bad routeset_len");
  const routeset = bytes.slice(5, 5 + len);
  return { status, routeset };
}

export interface AncPayload {
  status: number; // u8
  anchor: Uint8Array;
}

export function encodeANC(p: AncPayload): Uint8Array {
  if (!Number.isInteger(p.status) || p.status < 0 || p.status > 0xff) throw new Error("status out of range");
  if (p.anchor.length > 0xffffffff) throw new Error("anchor too large");
  return concatBytes(new Uint8Array([p.status & 0xff]), u32le(p.anchor.length >>> 0), p.anchor);
}

export function decodeANC(bytes: Uint8Array): AncPayload {
  if (bytes.length < 1 + 4) throw new Error("bad ANC length");
  const status = bytes[0];
  const len = readU32le(bytes, 1);
  if (bytes.length !== 1 + 4 + len) throw new Error("bad anchor_len");
  const anchor = bytes.slice(5, 5 + len);
  return { status, anchor };
}

export interface NotPayload {
  code: number; // u16
  retry: number; // u32
  msg?: string; // optional UTF-8
}

export function encodeNOT(p: NotPayload): Uint8Array {
  if (!Number.isInteger(p.code) || p.code < 0 || p.code > 0xffff) throw new Error("code out of range");
  if (!Number.isInteger(p.retry) || p.retry < 0 || p.retry > 0xffffffff) throw new Error("retry out of range");
  const msgBytes = p.msg ? new TextEncoder().encode(p.msg) : new Uint8Array();
  if (msgBytes.length > 0xffff) throw new Error("msg too long");
  return concatBytes(u16le(p.code), u32le(p.retry >>> 0), u16le(msgBytes.length), msgBytes);
}

export function decodeNOT(bytes: Uint8Array): NotPayload {
  if (bytes.length < 2 + 4 + 2) throw new Error("bad NOT length");
  const code = readU16le(bytes, 0);
  const retry = readU32le(bytes, 2);
  const msgLen = readU16le(bytes, 6);
  if (bytes.length !== 8 + msgLen) throw new Error("bad msg_len");
  const msg = msgLen ? new TextDecoder().decode(bytes.slice(8, 8 + msgLen)) : undefined;
  return { code, retry, msg };
}

export interface GspPayload {
  name_id: Uint8Array; // 32
  seq: bigint; // u64
  exp: bigint; // u64
  routeset_hash: Uint8Array; // 32
  hops: number; // u8
}

export function encodeGSP(p: GspPayload): Uint8Array {
  if (p.name_id.length !== 32) throw new Error("name_id must be 32 bytes");
  if (p.routeset_hash.length !== 32) throw new Error("routeset_hash must be 32 bytes");
  if (!Number.isInteger(p.hops) || p.hops < 0 || p.hops > 0xff) throw new Error("hops out of range");
  const reserved = new Uint8Array(7); // zero
  return concatBytes(p.name_id, u64le(p.seq), u64le(p.exp), p.routeset_hash, new Uint8Array([p.hops & 0xff]), reserved);
}

export function decodeGSP(bytes: Uint8Array): GspPayload {
  if (bytes.length !== 32 + 8 + 8 + 32 + 1 + 7) throw new Error("bad GSP length");
  const name_id = bytes.slice(0, 32);
  const seq = readU64le(bytes, 32);
  const exp = readU64le(bytes, 40);
  const routeset_hash = bytes.slice(48, 80);
  const hops = bytes[80];
  // bytes[81..87] reserved
  return { name_id, seq, exp, routeset_hash, hops };
}

export interface GetPayloadByNameSeq {
  mode: 1;
  name_id: Uint8Array; // 32
  seq: bigint; // 8
}
export interface GetPayloadByHash {
  mode: 2;
  hash: Uint8Array; // 32
}
export type GetPayload = GetPayloadByNameSeq | GetPayloadByHash;

export function encodeGET(p: GetPayload): Uint8Array {
  const reserved = new Uint8Array(7);
  if (p.mode === 1) {
    if (p.name_id.length !== 32) throw new Error("name_id must be 32 bytes");
    return concatBytes(new Uint8Array([1]), reserved, p.name_id, u64le(p.seq), new Uint8Array(32)); // hash unused
  }
  if (p.mode === 2) {
    if (p.hash.length !== 32) throw new Error("hash must be 32 bytes");
    return concatBytes(new Uint8Array([2]), reserved, new Uint8Array(32), u64le(0n), p.hash);
  }
  throw new Error("bad GET mode");
}

export function decodeGET(bytes: Uint8Array): GetPayload {
  // mode(1) + reserved(7) + name_id(32) + seq(8) + hash(32) = 80
  if (bytes.length !== 80) throw new Error("bad GET length");
  const mode = bytes[0];
  if (mode === 1) {
    const name_id = bytes.slice(8, 40);
    const seq = readU64le(bytes, 40);
    return { mode: 1, name_id, seq };
  }
  if (mode === 2) {
    const hash = bytes.slice(48, 80);
    return { mode: 2, hash };
  }
  throw new Error("bad GET mode");
}

export interface PutPayload {
  routeset: Uint8Array;
}

export function encodePUT(p: PutPayload): Uint8Array {
  if (p.routeset.length > 0xffffffff) throw new Error("routeset too large");
  return concatBytes(u32le(p.routeset.length >>> 0), p.routeset);
}

export function decodePUT(bytes: Uint8Array): PutPayload {
  if (bytes.length < 4) throw new Error("bad PUT length");
  const len = readU32le(bytes, 0);
  if (bytes.length !== 4 + len) throw new Error("bad routeset_len");
  return { routeset: bytes.slice(4, 4 + len) };
}

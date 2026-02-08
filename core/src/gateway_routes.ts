import { ascii, concatBytes, readU16le, readU32le, readU64le, u16le, u32le, u64le } from "./bytes.js";

export const GW_MAGIC = ascii("GWRT");
export const GW_VERSION = 1;

export enum TargetKind {
  NODE_ID = 1,
  IPV4_PORT = 2,
  IPV6_PORT = 3,
  DNS_NAME = 4
}

export enum PatternKind {
  EXACT = 1,
  WILDCARD = 2
}

export type GatewayTarget = {
  kind: TargetKind;
  data: Uint8Array;
};

export type GatewaySet = {
  gateway_set_id: number; // u32
  targets: GatewayTarget[];
};

export type PatternLabel =
  | { kind: PatternKind.WILDCARD }
  | { kind: PatternKind.EXACT; label: string };

export type GatewayRule = {
  priority: number; // u8
  flags: number; // u8
  pattern: PatternLabel[];
  gateway_set_id: number; // u32
};

export type GatewayRoutesV1 = {
  ns_id: number; // u32
  parent_name_id: Uint8Array; // 32
  g_seq: bigint; // u64
  g_exp: bigint; // u64
  gateway_sets: GatewaySet[];
  rules: GatewayRule[];
  owner_pub: Uint8Array; // 32
  sig?: Uint8Array; // 64
};

function encodePatternLabel(l: PatternLabel): Uint8Array {
  if (l.kind === PatternKind.WILDCARD) return new Uint8Array([PatternKind.WILDCARD, 0]);
  const bytes = ascii(l.label);
  if (bytes.length < 1 || bytes.length > 63) throw new Error("label length");
  return concatBytes(new Uint8Array([PatternKind.EXACT, bytes.length]), bytes);
}

function decodePatternLabel(bytes: Uint8Array, off: number): { label: PatternLabel; offset: number } {
  const kind = bytes[off++];
  const len = bytes[off++];
  if (kind === PatternKind.WILDCARD) {
    return { label: { kind: PatternKind.WILDCARD }, offset: off };
  }
  const lbl = new TextDecoder().decode(bytes.slice(off, off + len));
  return { label: { kind: PatternKind.EXACT, label: lbl }, offset: off + len };
}

function sortGatewaySetsCanonical(sets: GatewaySet[]): GatewaySet[] {
  return [...sets].sort((a, b) => a.gateway_set_id - b.gateway_set_id);
}

function sortRulesCanonical(rules: GatewayRule[]): GatewayRule[] {
  return [...rules].sort((a, b) => {
    if (a.pattern.length !== b.pattern.length) return a.pattern.length - b.pattern.length;
    const aBytes = concatBytes(...a.pattern.map(encodePatternLabel));
    const bBytes = concatBytes(...b.pattern.map(encodePatternLabel));
    const m = Math.min(aBytes.length, bBytes.length);
    for (let i = 0; i < m; i++) {
      const d = aBytes[i] - bBytes[i];
      if (d !== 0) return d;
    }
    if (aBytes.length !== bBytes.length) return aBytes.length - bBytes.length;
    if (a.gateway_set_id !== b.gateway_set_id) return a.gateway_set_id - b.gateway_set_id;
    return a.priority - b.priority;
  });
}

export function encodeGatewayRoutesV1(gr: GatewayRoutesV1, { canonicalize = true }: { canonicalize?: boolean } = {}): Uint8Array {
  if (gr.parent_name_id.length !== 32) throw new Error("parent_name_id must be 32 bytes");
  if (gr.owner_pub.length !== 32) throw new Error("owner_pub must be 32 bytes");
  if (!Number.isInteger(gr.ns_id) || gr.ns_id < 0 || gr.ns_id > 0xffffffff) throw new Error("ns_id out of range");
  if (gr.sig && gr.sig.length !== 64) throw new Error("sig must be 64 bytes");

  const gateway_sets = canonicalize ? sortGatewaySetsCanonical(gr.gateway_sets) : gr.gateway_sets;
  const rules = canonicalize ? sortRulesCanonical(gr.rules) : gr.rules;

  const gwParts: Uint8Array[] = [];
  for (const set of gateway_sets) {
    if (!Number.isInteger(set.gateway_set_id) || set.gateway_set_id < 0 || set.gateway_set_id > 0xffffffff) {
      throw new Error("gateway_set_id out of range");
    }
    if (set.targets.length > 255) throw new Error("too many targets");

    const targetParts: Uint8Array[] = [];
    for (const t of set.targets) {
      if (!Number.isInteger(t.kind)) throw new Error("invalid target kind");
      if (t.data.length > 0xffff) throw new Error("target data too long");
      targetParts.push(new Uint8Array([t.kind]), u16le(t.data.length), t.data);
    }

    gwParts.push(u32le(set.gateway_set_id >>> 0), new Uint8Array([set.targets.length]), ...targetParts);
  }

  const ruleParts: Uint8Array[] = [];
  for (const r of rules) {
    if (r.pattern.length > 255) throw new Error("pattern too long");
    const pattBytes = concatBytes(...r.pattern.map(encodePatternLabel));
    ruleParts.push(
      new Uint8Array([r.priority & 0xff, r.flags & 0xff, r.pattern.length & 0xff]),
      pattBytes,
      u32le(r.gateway_set_id >>> 0)
    );
  }

  const header = concatBytes(
    GW_MAGIC,
    new Uint8Array([GW_VERSION]),
    u32le(gr.ns_id >>> 0),
    gr.parent_name_id,
    u64le(gr.g_seq),
    u64le(gr.g_exp),
    u16le(gateway_sets.length),
    u16le(rules.length)
  );

  const body = concatBytes(...gwParts, ...ruleParts, gr.owner_pub);
  const withoutSig = concatBytes(header, body);

  return gr.sig ? concatBytes(withoutSig, gr.sig) : withoutSig;
}

export function decodeGatewayRoutesV1(bytes: Uint8Array): GatewayRoutesV1 {
  let off = 0;
  const magic = bytes.slice(off, off + 4); off += 4;
  if (GW_MAGIC.some((b, i) => magic[i] !== b)) throw new Error("bad magic");
  const version = bytes[off++]; if (version !== 1) throw new Error("bad version");

  const ns_id = readU32le(bytes, off); off += 4;
  const parent_name_id = bytes.slice(off, off + 32); off += 32;
  const g_seq = readU64le(bytes, off); off += 8;
  const g_exp = readU64le(bytes, off); off += 8;
  const gwset_count = readU16le(bytes, off); off += 2;
  const rule_count = readU16le(bytes, off); off += 2;

  const gateway_sets: GatewaySet[] = [];
  for (let i = 0; i < gwset_count; i++) {
    const gateway_set_id = readU32le(bytes, off); off += 4;
    const target_count = bytes[off++];
    const targets: GatewayTarget[] = [];
    for (let t = 0; t < target_count; t++) {
      const kind = bytes[off++] as TargetKind;
      const dlen = readU16le(bytes, off); off += 2;
      const data = bytes.slice(off, off + dlen); off += dlen;
      targets.push({ kind, data });
    }
    gateway_sets.push({ gateway_set_id, targets });
  }

  const rules: GatewayRule[] = [];
  for (let i = 0; i < rule_count; i++) {
    const priority = bytes[off++];
    const flags = bytes[off++];
    const pattern_len = bytes[off++];
    const pattern: PatternLabel[] = [];
    for (let p = 0; p < pattern_len; p++) {
      const res = decodePatternLabel(bytes, off);
      pattern.push(res.label);
      off = res.offset;
    }
    const gateway_set_id = readU32le(bytes, off); off += 4;
    rules.push({ priority, flags, pattern, gateway_set_id });
  }

  const owner_pub = bytes.slice(off, off + 32); off += 32;
  const sig = (off + 64 <= bytes.length) ? bytes.slice(off, off + 64) : undefined;

  return { ns_id, parent_name_id, g_seq, g_exp, gateway_sets, rules, owner_pub, sig };
}

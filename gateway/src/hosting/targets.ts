export type HostingScheme = "ipfs" | "ar";

export type ParsedHostingTarget = {
  scheme: HostingScheme;
  value: string;
  normalizedDest: string;
};

export type HostingProofFields = {
  recordSource: "contenthash" | "text";
  recordKey?: string;
  rawValue: string;
  parsedTarget: { scheme: HostingScheme; value: string };
};

const IPFS_NS_CODE = 0xe3;
const ARWEAVE_NS_CODE = 0xb29910;

const CIDV1_BASE32_RE = /^bafy[0-9a-z]{20,}$/i;
const CIDV0_BASE58_RE = /^Qm[1-9A-HJ-NP-Za-km-z]{40,}$/;
const AR_TX_RE = /^[A-Za-z0-9_-]{43,64}$/;

export function isCidLike(value: string): boolean {
  return CIDV1_BASE32_RE.test(value) || CIDV0_BASE58_RE.test(value);
}

export function isArweaveTxLike(value: string): boolean {
  return AR_TX_RE.test(value);
}

export function parseHostingTarget(raw: string): ParsedHostingTarget | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  if (/^ipfs:\/\//i.test(trimmed)) {
    const value = trimmed.replace(/^ipfs:\/\//i, "").split(/[/?#]/)[0];
    if (!isCidLike(value)) return null;
    return { scheme: "ipfs", value, normalizedDest: `ipfs://${value}` };
  }

  if (/^ar:\/\//i.test(trimmed)) {
    const value = trimmed.replace(/^ar:\/\//i, "").split(/[/?#]/)[0];
    if (!isArweaveTxLike(value)) return null;
    return { scheme: "ar", value, normalizedDest: `ar://${value}` };
  }

  if (isCidLike(trimmed)) {
    return { scheme: "ipfs", value: trimmed, normalizedDest: `ipfs://${trimmed}` };
  }

  if (isArweaveTxLike(trimmed)) {
    return { scheme: "ar", value: trimmed, normalizedDest: `ar://${trimmed}` };
  }

  return null;
}

export function decodeEnsContenthash(rawValue: string): ParsedHostingTarget | null {
  const bytes = hexToBytes(rawValue);
  if (!bytes || bytes.length === 0) return null;

  const decoded = readUvarint(bytes, 0);
  if (!decoded) return null;

  const codec = decoded.value;
  const payload = bytes.slice(decoded.next);
  if (!payload.length) return null;

  if (codec === IPFS_NS_CODE) {
    const cid = cidBytesToString(payload);
    if (!isCidLike(cid)) return null;
    return { scheme: "ipfs", value: cid, normalizedDest: `ipfs://${cid}` };
  }

  if (codec === ARWEAVE_NS_CODE) {
    const tx = bytesToBase64Url(payload);
    if (!isArweaveTxLike(tx)) return null;
    return { scheme: "ar", value: tx, normalizedDest: `ar://${tx}` };
  }

  return null;
}

export function selectTextHostingTarget(
  entries: Array<{ key: string; value: string }>
): (ParsedHostingTarget & { key: string; rawValue: string }) | null {
  const selected = selectPreferredTextRecord(entries);
  if (!selected || !selected.parsed) return null;
  return { ...selected.parsed, key: selected.key, rawValue: selected.rawValue };
}

export function selectPreferredTextRecord(
  entries: Array<{ key: string; value: string }>
): { key: string; rawValue: string; parsed: ParsedHostingTarget | null } | null {
  const order = ["content", "ipfs", "arweave", "url"];
  const normalized = entries.map((entry) => ({
    key: String(entry.key || "").toLowerCase().trim(),
    value: String(entry.value || "").trim()
  }));

  for (const key of order) {
    const hit = normalized.find((entry) => entry.key === key && entry.value);
    if (!hit) continue;
    return { key, rawValue: hit.value, parsed: parseHostingTarget(hit.value) };
  }

  return null;
}

export function toHostingProofFieldsFromContenthash(rawValue: string): HostingProofFields | null {
  const parsed = decodeEnsContenthash(rawValue);
  if (!parsed) return null;
  return {
    recordSource: "contenthash",
    rawValue,
    parsedTarget: {
      scheme: parsed.scheme,
      value: parsed.value
    }
  };
}

function hexToBytes(value: string): Uint8Array | null {
  const clean = String(value || "").trim().replace(/^0x/i, "");
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function readUvarint(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
  let x = 0;
  let s = 0;
  let i = offset;
  while (i < bytes.length && i - offset < 10) {
    const b = bytes[i];
    if (b < 0x80) {
      if (i - offset === 9 && b > 1) return null;
      return { value: x | (b << s), next: i + 1 };
    }
    x |= (b & 0x7f) << s;
    s += 7;
    i += 1;
  }
  return null;
}

function cidBytesToString(bytes: Uint8Array): string {
  if (bytes.length === 34 && bytes[0] === 0x12 && bytes[1] === 0x20) {
    return base58btc(bytes);
  }
  return `b${base32LowerNoPad(bytes)}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base32LowerNoPad(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 31];
  }
  return out;
}

function base58btc(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let digits = [0];

  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      const val = digits[i] * 256 + carry;
      digits[i] = val % 58;
      carry = Math.floor(val / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let out = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += "1";
  }

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    out += alphabet[digits[i]];
  }

  return out;
}

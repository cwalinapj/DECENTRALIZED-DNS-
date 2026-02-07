import { ascii } from "./bytes.js";

export function rrA(ipv4: string): Uint8Array {
  const parts = ipv4.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error("invalid ipv4");
  }
  return new Uint8Array(parts);
}

export function rrAAAA(ipv6: string): Uint8Array {
  const [left, right] = ipv6.split("::");
  const leftParts = left ? left.split(":").filter(Boolean) : [];
  const rightParts = right ? right.split(":").filter(Boolean) : [];
  if (leftParts.length + rightParts.length > 8) throw new Error("invalid ipv6");
  const zerosToInsert = 8 - (leftParts.length + rightParts.length);
  const parts = [...leftParts, ...Array(zerosToInsert).fill("0"), ...rightParts];
  if (parts.length !== 8) throw new Error("invalid ipv6");
  const out = new Uint8Array(16);
  parts.forEach((p, i) => {
    const val = parseInt(p, 16);
    if (!Number.isFinite(val) || val < 0 || val > 0xffff) throw new Error("invalid ipv6");
    out[i * 2] = (val >> 8) & 0xff;
    out[i * 2 + 1] = val & 0xff;
  });
  return out;
}

export function rrCNAME(name: string): Uint8Array {
  if (!name) throw new Error("empty cname");
  return ascii(name.toLowerCase());
}

export function rrTXT(text: string): Uint8Array {
  const enc = new TextEncoder().encode(text);
  if (enc.length > 65535) throw new Error("txt too long");
  return enc;
}

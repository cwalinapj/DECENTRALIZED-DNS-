import { blake3 } from "@noble/hashes/blake3";

export function blake3_256(bytes: Uint8Array): Uint8Array {
  return blake3(bytes, { dkLen: 32 });
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function hex0x(b: Uint8Array): string {
  return "0x" + Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex0x(hex: string): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (s.length !== 64) throw new Error("expected 32-byte hex");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

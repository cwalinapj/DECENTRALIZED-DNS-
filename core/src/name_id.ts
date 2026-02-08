import { blake3 } from "@noble/hashes/blake3";
import { concatBytes, u32le, ascii } from "./bytes.js";

/**
 * name_id = BLAKE3_256( LE32(ns_id) || ASCII_BYTES(normalized_name) )
 */
export function deriveNameId(nsId: number, normalizedName: string): Uint8Array {
  if (!Number.isInteger(nsId) || nsId < 0 || nsId > 0xffffffff) throw new Error("nsId out of range");
  // normalizedName should already be ascii + lowercase by normalizeName()
  const payload = concatBytes(u32le(nsId >>> 0), ascii(normalizedName));
  return blake3(payload, { dkLen: 32 });
}

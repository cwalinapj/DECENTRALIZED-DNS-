import { keccak_256 } from "@noble/hashes/sha3";
import { utf8, hex0x } from "./blake3.js";

/** component_id = keccak256(utf8(componentName)) */
export function componentIdHex(componentName: string): string {
  const h = keccak_256(utf8(componentName));
  return hex0x(h);
}

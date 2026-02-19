import { ed25519Verify } from "../src/crypto_ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils";
import type { ReceiptEnvelope } from "./types.js";
import { validateReceiptShape, verifyReceiptSignature } from "./receipts.js";

export async function verifyReceipt(envelope: ReceiptEnvelope): Promise<{ ok: boolean; error?: string }> {
  const err = validateReceiptShape(envelope);
  if (err) return { ok: false, error: err };
  const ok = await verifyReceiptSignature(envelope.public_key, envelope.receipt, envelope.signature);
  return ok ? { ok: true } : { ok: false, error: "INVALID_SIGNATURE" };
}

export async function verifyEd25519Message(pubKeyHex: string, message: string, signatureHex: string): Promise<boolean> {
  const pub = hexToBytes(pubKeyHex);
  const sig = hexToBytes(signatureHex);
  return await ed25519Verify(pub, utf8ToBytes(message), sig);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hex length must be even");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

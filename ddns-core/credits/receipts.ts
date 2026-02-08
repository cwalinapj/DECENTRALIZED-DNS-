import { ed25519Sign, ed25519Verify } from "../src/crypto_ed25519.js";
import type { Receipt, ReceiptEnvelope, ReceiptValidationError } from "./types.js";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function receiptMessage(receipt: Receipt): string {
  return `receipt\n${stableStringify(receipt)}`;
}

export async function signReceipt(privKeyHex: string, receipt: Receipt): Promise<string> {
  const msg = new TextEncoder().encode(receiptMessage(receipt));
  const sig = await ed25519Sign(hexToBytes(privKeyHex), msg);
  return bytesToBase64(sig);
}

export async function verifyReceiptSignature(pubKeyB64: string, receipt: Receipt, signatureB64: string): Promise<boolean> {
  const msg = new TextEncoder().encode(receiptMessage(receipt));
  return await ed25519Verify(base64ToBytes(pubKeyB64), msg, base64ToBytes(signatureB64));
}

export function validateReceiptShape(envelope: ReceiptEnvelope): ReceiptValidationError | null {
  if (!envelope?.receipt || !envelope?.signature || !envelope?.public_key) return "MISSING_FIELDS";
  const { receipt } = envelope;
  if (!receipt.type || !receipt.node_id || !receipt.ts) return "MISSING_FIELDS";
  if (!receipt.node_id || receipt.node_id !== envelope.public_key) return "NODE_ID_MISMATCH";
  if (!"SERVE VERIFY STORE".split(" ").includes(receipt.type)) return "UNKNOWN_TYPE";
  return null;
}

export function makeEnvelope(receipt: Receipt, signatureB64: string, publicKeyB64: string): ReceiptEnvelope {
  return { receipt, signature: signatureB64, public_key: publicKeyB64 };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64"));
}

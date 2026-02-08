import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { ed25519Sign, ed25519Verify } from "../src/crypto_ed25519.js";
import type { Receipt, ReceiptCore, ReceiptValidationError } from "./types.js";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function receiptMessage(core: ReceiptCore): string {
  return `receipt\n${stableStringify(core)}`;
}

export function computeReceiptId(core: Omit<ReceiptCore, "id">): string {
  const payload = stableStringify(core);
  return bytesToHex(sha256(utf8ToBytes(payload)));
}

export async function signReceipt(privKeyHex: string, core: ReceiptCore): Promise<string> {
  const msg = utf8ToBytes(receiptMessage(core));
  const sig = await ed25519Sign(hexToBytes(privKeyHex), msg);
  return bytesToHex(sig);
}

export async function verifyReceiptSignature(pubKeyHex: string, receipt: Receipt): Promise<boolean> {
  const msg = utf8ToBytes(receiptMessage({
    id: receipt.id,
    type: receipt.type,
    wallet: receipt.wallet,
    timestamp: receipt.timestamp,
    payload: receipt.payload
  }));
  return await ed25519Verify(hexToBytes(pubKeyHex), msg, hexToBytes(receipt.signature));
}

export function validateReceiptShape(receipt: Receipt): ReceiptValidationError | null {
  if (!receipt?.id || !receipt?.type || !receipt?.wallet || !receipt?.timestamp || !receipt?.payload) {
    return "MISSING_FIELDS";
  }
  if (!receipt.signature) return "MISSING_FIELDS";
  if (!["SERVE", "VERIFY", "STORE"].includes(receipt.type)) return "UNKNOWN_TYPE";
  return null;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

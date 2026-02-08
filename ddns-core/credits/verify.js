import { ed25519Verify } from "../src/crypto_ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils";
import { validateReceiptShape, verifyReceiptSignature } from "./receipts.js";
export async function verifyReceipt(pubKeyHex, receipt) {
    const err = validateReceiptShape(receipt);
    if (err)
        return { ok: false, error: err };
    const ok = await verifyReceiptSignature(pubKeyHex, receipt);
    return ok ? { ok: true } : { ok: false, error: "INVALID_SIGNATURE" };
}
export async function verifyEd25519Message(pubKeyHex, message, signatureHex) {
    const pub = hexToBytes(pubKeyHex);
    const sig = hexToBytes(signatureHex);
    return await ed25519Verify(pub, utf8ToBytes(message), sig);
}
function hexToBytes(hex) {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

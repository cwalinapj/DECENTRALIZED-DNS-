import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
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
    ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
    const pub = hexToBytes(pubKeyHex);
    const sig = hexToBytes(signatureHex);
    return await ed.verifyAsync(sig, utf8ToBytes(message), pub);
}
function hexToBytes(hex) {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

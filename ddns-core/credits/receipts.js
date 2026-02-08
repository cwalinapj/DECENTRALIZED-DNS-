import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
function stableStringify(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
export function receiptMessage(core) {
    return `receipt\n${stableStringify(core)}`;
}
export function computeReceiptId(core) {
    const payload = stableStringify(core);
    return bytesToHex(sha256(utf8ToBytes(payload)));
}
export async function signReceipt(privKeyHex, core) {
    ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
    const msg = utf8ToBytes(receiptMessage(core));
    const sig = await ed.signAsync(msg, hexToBytes(privKeyHex));
    return bytesToHex(sig);
}
export async function verifyReceiptSignature(pubKeyHex, receipt) {
    ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
    const msg = utf8ToBytes(receiptMessage({
        id: receipt.id,
        type: receipt.type,
        wallet: receipt.wallet,
        timestamp: receipt.timestamp,
        payload: receipt.payload
    }));
    return await ed.verifyAsync(hexToBytes(receipt.signature), msg, hexToBytes(pubKeyHex));
}
export function validateReceiptShape(receipt) {
    if (!receipt?.id || !receipt?.type || !receipt?.wallet || !receipt?.timestamp || !receipt?.payload) {
        return "MISSING_FIELDS";
    }
    if (!receipt.signature)
        return "MISSING_FIELDS";
    if (!["SERVE", "VERIFY", "STORE"].includes(receipt.type))
        return "UNKNOWN_TYPE";
    return null;
}
function hexToBytes(hex) {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

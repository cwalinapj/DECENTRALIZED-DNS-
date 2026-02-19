import crypto from "node:crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export type DomainContinuityPhase =
  | "A_SOFT_WARNING"
  | "B_HARD_WARNING"
  | "HOLD_BANNER"
  | "C_SAFE_PARKED"
  | "D_REGISTRY_FINALIZATION";

export type DomainNoticePayload = {
  domain: string;
  phase: DomainContinuityPhase;
  issued_at: string;
  expires_at: string;
  reason_codes: string[];
  policy_version: string;
  nonce: string;
};

const PRIVATE_KEY_HEX = process.env.DOMAIN_NOTICE_PRIVATE_KEY_HEX || crypto.randomBytes(32).toString("hex");

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) {
    throw new Error("invalid_hex");
  }
  return Uint8Array.from(Buffer.from(cleaned, "hex"));
}

function b64urlEncode(data: Uint8Array | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  return buf.toString("base64url");
}

function b64urlDecode(data: string): Uint8Array {
  return Uint8Array.from(Buffer.from(data, "base64url"));
}

export function getNoticePublicKeyHex(): string {
  const pub = ed.getPublicKey(hexToBytes(PRIVATE_KEY_HEX));
  return Buffer.from(pub).toString("hex");
}

export async function createNoticeToken(payload: DomainNoticePayload): Promise<{ token: string; pubkey: string }> {
  const payloadJson = JSON.stringify(payload);
  const payloadPart = b64urlEncode(payloadJson);
  const sig = await ed.sign(Buffer.from(payloadJson, "utf8"), hexToBytes(PRIVATE_KEY_HEX));
  const token = `${payloadPart}.${b64urlEncode(sig)}`;
  return { token, pubkey: getNoticePublicKeyHex() };
}

export async function verifyNoticeToken(token: string): Promise<{ valid: boolean; payload?: DomainNoticePayload }> {
  try {
    const [payloadPart, sigPart] = token.split(".");
    if (!payloadPart || !sigPart) return { valid: false };
    const payloadBytes = b64urlDecode(payloadPart);
    const sigBytes = b64urlDecode(sigPart);
    const valid = await ed.verify(sigBytes, payloadBytes, hexToBytes(getNoticePublicKeyHex()));
    if (!valid) return { valid: false };
    const payload = JSON.parse(Buffer.from(payloadBytes).toString("utf8")) as DomainNoticePayload;
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

import crypto from "node:crypto";
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

export type CommentAuthState = {
  challenges: Map<string, { wallet: string; challenge: string; expiresAt: number }>;
};

export function createCommentChallenge(
  state: CommentAuthState,
  wallet: string,
  ttlMs: number
) {
  const challenge = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + ttlMs;
  state.challenges.set(wallet, { wallet, challenge, expiresAt });
  return { wallet, challenge, expiresAt };
}

export function verifyCommentSignature(
  state: CommentAuthState,
  wallet: string,
  signatureHex: string
): boolean {
  const entry = state.challenges.get(wallet);
  if (!entry || entry.expiresAt < Date.now()) return false;
  const message = `ddns-comments-login:${entry.challenge}`;
  const recovered = recoverAddress(message, signatureHex);
  if (!recovered) return false;
  const ok = recovered.toLowerCase() === wallet.toLowerCase();
  if (ok) {
    state.challenges.delete(wallet);
  }
  return ok;
}

function recoverAddress(message: string, signatureHex: string): string | null {
  const sigHex = signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex;
  if (sigHex.length !== 130) return null;
  const r = sigHex.slice(0, 64);
  const s = sigHex.slice(64, 128);
  let v = parseInt(sigHex.slice(128, 130), 16);
  if (Number.isNaN(v)) return null;
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) return null;
  const msgHash = hashMessage(message);
  const signature = secp.Signature.fromCompact(r + s).addRecoveryBit(v);
  const pub = signature.recoverPublicKey(msgHash);
  const pubBytes = pub.toRawBytes(false).slice(1);
  const addr = keccak_256(pubBytes).slice(-20);
  return `0x${bytesToHex(addr)}`;
}

function hashMessage(message: string): Uint8Array {
  const messageBytes = new TextEncoder().encode(message);
  const prefix = `\u0019Ethereum Signed Message:\n${messageBytes.length}`;
  const prefixBytes = new TextEncoder().encode(prefix);
  const payload = new Uint8Array(prefixBytes.length + messageBytes.length);
  payload.set(prefixBytes);
  payload.set(messageBytes, prefixBytes.length);
  return keccak_256(payload);
}

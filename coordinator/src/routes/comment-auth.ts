import crypto from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";

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
  signatureBase64: string,
  challenge?: string
): boolean {
  const entry = state.challenges.get(wallet);
  if (!entry || entry.expiresAt < Date.now()) return false;
  if (challenge && challenge !== entry.challenge) return false;
  const message = `ddns-comments-login:${entry.challenge}`;
  const ok = verifySolSignature(wallet, message, signatureBase64);
  if (ok) {
    state.challenges.delete(wallet);
  }
  return ok;
}

function verifySolSignature(pubkey: string, message: string, signatureBase64: string): boolean {
  let pubBytes: Uint8Array;
  try {
    pubBytes = bs58.decode(pubkey);
  } catch {
    return false;
  }
  let sigBytes: Uint8Array;
  try {
    sigBytes = new Uint8Array(Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
  return nacl.sign.detached.verify(new TextEncoder().encode(message), sigBytes, pubBytes);
}

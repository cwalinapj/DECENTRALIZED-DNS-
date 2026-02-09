import crypto from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

export type Challenge = {
  wallet: string;
  nonce: string;
  expiresAtMs: number;
};

export type ChallengeStore = {
  create(wallet: string): Challenge;
  consume(wallet: string, nonce: string): Challenge | null;
};

export function createInMemoryChallengeStore(ttlMs: number): ChallengeStore {
  const m = new Map<string, Challenge>();
  return {
    create(wallet: string): Challenge {
      const nonce = crypto.randomBytes(16).toString("hex");
      const ch: Challenge = {
        wallet,
        nonce,
        expiresAtMs: Date.now() + ttlMs,
      };
      m.set(wallet, ch);
      return ch;
    },
    consume(wallet: string, nonce: string): Challenge | null {
      const cur = m.get(wallet);
      if (!cur) return null;
      if (cur.nonce !== nonce) return null;
      if (Date.now() > cur.expiresAtMs) {
        m.delete(wallet);
        return null;
      }
      m.delete(wallet);
      return cur;
    },
  };
}

export function challengeMessage(wallet: string, nonce: string): Uint8Array {
  return new TextEncoder().encode(`DDNS_CHALLENGE:${wallet}:${nonce}`);
}

function decodeSig(sig: string): Uint8Array {
  // Accept base58 or base64. (Solana wallet-adapter often uses Uint8Array directly.)
  try {
    return bs58.decode(sig);
  } catch {
    // fallthrough
  }
  return Buffer.from(sig, "base64");
}

export function verifySignedChallenge(args: {
  wallet: string;
  nonce: string;
  signature: string;
}): boolean {
  const pub = bs58.decode(args.wallet);
  const msg = challengeMessage(args.wallet, args.nonce);
  const sig = decodeSig(args.signature);
  return nacl.sign.detached.verify(msg, sig, pub);
}

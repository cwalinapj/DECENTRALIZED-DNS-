import crypto from "node:crypto";
import type { Receipt } from "../../../../../ddns-core/credits/types.d.ts";
import { validateReceiptShape, verifyReceiptSignature } from "../../../../../ddns-core/credits/receipts.js";
import { verifyEd25519Message } from "../../../../../ddns-core/credits/verify.js";

export type CreditsState = {
  receipts: Map<string, Receipt>;
  credits: Map<string, number>;
  passports: Set<string>;
  challenges: Map<string, { wallet: string; chunkHash: string; expiresAt: number }>;
  rate: Map<string, { count: number; windowStart: number }>;
};

export type ReceiptResult = { ok: boolean; error?: string };

export type ReceiptConfig = {
  serveCredits: number;
  verifyCredits: number;
  storeCredits: number;
  resolverPubkeyHex?: string;
  allowUnverifiedServe?: boolean;
  maxPerMinute: number;
};

export function validateAndApplyReceipt(
  state: CreditsState,
  receipt: Receipt,
  config: ReceiptConfig
): ReceiptResult {
  const shapeErr = validateReceiptShape(receipt);
  if (shapeErr) return { ok: false, error: shapeErr };
  if (!state.passports.has(receipt.wallet)) return { ok: false, error: "PASSPORT_REQUIRED" };

  if (state.receipts.has(receipt.id)) {
    return { ok: true };
  }

  const now = Date.now();
  const rate = state.rate.get(receipt.wallet) || { count: 0, windowStart: now };
  if (now - rate.windowStart > 60_000) {
    rate.count = 0;
    rate.windowStart = now;
  }
  rate.count += 1;
  state.rate.set(receipt.wallet, rate);
  if (rate.count > config.maxPerMinute) return { ok: false, error: "RATE_LIMITED" };

  return { ok: true };
}

export async function applyReceipt(
  state: CreditsState,
  receipt: Receipt,
  config: ReceiptConfig
): Promise<ReceiptResult> {
  const pre = validateAndApplyReceipt(state, receipt, config);
  if (!pre.ok) return pre;

  const sigOk = await verifyReceiptSignature(receipt.wallet, receipt);
  if (!sigOk) return { ok: false, error: "INVALID_SIGNATURE" };

  if (receipt.type === "SERVE") {
    if (!config.resolverPubkeyHex && !config.allowUnverifiedServe) {
      return { ok: false, error: "AUTHORITY_SIG_REQUIRED" };
    }
    if (config.resolverPubkeyHex && receipt.payload.authoritySig && receipt.payload.responseHash) {
      const msg = `resolve\n${receipt.payload.responseHash}`;
      const expected = await verifyEd25519Message(
        config.resolverPubkeyHex,
        msg,
        receipt.payload.authoritySig
      );
      if (!expected) return { ok: false, error: "AUTHORITY_SIG_INVALID" };
    } else if (config.resolverPubkeyHex && !config.allowUnverifiedServe) {
      return { ok: false, error: "AUTHORITY_SIG_REQUIRED" };
    }
    credit(state, receipt.wallet, config.serveCredits);
  }

  if (receipt.type === "VERIFY") {
    const challenge = receipt.payload.challengeId ? state.challenges.get(receipt.payload.challengeId) : null;
    if (!challenge) return { ok: false, error: "CHALLENGE_INVALID" };
    if (challenge.wallet !== receipt.wallet) return { ok: false, error: "CHALLENGE_INVALID" };
    if (challenge.expiresAt < Date.now()) return { ok: false, error: "CHALLENGE_INVALID" };
    if (receipt.payload.chunkHash !== challenge.chunkHash) return { ok: false, error: "CHALLENGE_INVALID" };
    credit(state, receipt.wallet, config.verifyCredits);
  }

  if (receipt.type === "STORE") {
    credit(state, receipt.wallet, config.storeCredits);
  }

  state.receipts.set(receipt.id, receipt);
  return { ok: true };
}

export function createChallenge(state: CreditsState, wallet: string, chunkHash: string, ttlMs: number) {
  const id = crypto.randomUUID();
  state.challenges.set(id, { wallet, chunkHash, expiresAt: Date.now() + ttlMs });
  return { id, wallet, chunkHash, expiresAt: Date.now() + ttlMs };
}

export function credit(state: CreditsState, wallet: string, amount: number) {
  const current = state.credits.get(wallet) || 0;
  state.credits.set(wallet, current + amount);
}

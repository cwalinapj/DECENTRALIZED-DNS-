import crypto from "node:crypto";
import type { ReceiptEnvelope } from "../../../../../ddns-core/dist/credits/types.d.ts";
import { validateReceiptShape, verifyReceiptSignature } from "../../../../../ddns-core/dist/credits/receipts.js";
import { verifyEd25519Message } from "../../../../../ddns-core/dist/credits/verify.js";

export type CreditsState = {
  receipts: Map<string, ReceiptEnvelope>;
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
  envelope: ReceiptEnvelope,
  config: ReceiptConfig
): ReceiptResult {
  const shapeErr = validateReceiptShape(envelope);
  if (shapeErr) return { ok: false, error: shapeErr };
  const receipt = envelope.receipt;
  if (!state.passports.has(receipt.node_id)) return { ok: false, error: "PASSPORT_REQUIRED" };

  const receiptId = receiptIdFromEnvelope(envelope);
  if (state.receipts.has(receiptId)) {
    return { ok: true };
  }

  const now = Date.now();
  const rate = state.rate.get(receipt.node_id) || { count: 0, windowStart: now };
  if (now - rate.windowStart > 60_000) {
    rate.count = 0;
    rate.windowStart = now;
  }
  rate.count += 1;
  state.rate.set(receipt.node_id, rate);
  if (rate.count > config.maxPerMinute) return { ok: false, error: "RATE_LIMITED" };

  return { ok: true };
}

export async function applyReceipt(
  state: CreditsState,
  envelope: ReceiptEnvelope,
  config: ReceiptConfig
): Promise<ReceiptResult> {
  const pre = validateAndApplyReceipt(state, envelope, config);
  if (!pre.ok) return pre;

  const receipt = envelope.receipt;
  const sigOk = await verifyReceiptSignature(envelope.public_key, receipt, envelope.signature);
  if (!sigOk) return { ok: false, error: "INVALID_SIGNATURE" };

  if (receipt.type === "SERVE") {
    if (!config.resolverPubkeyHex && !config.allowUnverifiedServe) {
      return { ok: false, error: "AUTHORITY_SIG_REQUIRED" };
    }
    if (config.resolverPubkeyHex && receipt.details?.authoritySig && receipt.result_hash) {
      const msg = `resolve\n${receipt.result_hash}`;
      const expected = await verifyEd25519Message(
        config.resolverPubkeyHex,
        msg,
        receipt.details.authoritySig as string
      );
      if (!expected) return { ok: false, error: "AUTHORITY_SIG_INVALID" };
    } else if (config.resolverPubkeyHex && !config.allowUnverifiedServe) {
      return { ok: false, error: "AUTHORITY_SIG_REQUIRED" };
    }
    credit(state, receipt.node_id, config.serveCredits);
  }

  if (receipt.type === "VERIFY") {
    const challenge = receipt.details?.challengeId ? state.challenges.get(receipt.details.challengeId as string) : null;
    if (!challenge) return { ok: false, error: "CHALLENGE_INVALID" };
    if (challenge.wallet !== receipt.node_id) return { ok: false, error: "CHALLENGE_INVALID" };
    if (challenge.expiresAt < Date.now()) return { ok: false, error: "CHALLENGE_INVALID" };
    if (receipt.details?.chunkHash !== challenge.chunkHash) return { ok: false, error: "CHALLENGE_INVALID" };
    credit(state, receipt.node_id, config.verifyCredits);
  }

  if (receipt.type === "STORE") {
    credit(state, receipt.node_id, config.storeCredits);
  }

  const receiptId = receiptIdFromEnvelope(envelope);
  state.receipts.set(receiptId, envelope);
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

export function receiptIdFromEnvelope(envelope: ReceiptEnvelope): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(envelope.receipt))
    .digest("hex");
}

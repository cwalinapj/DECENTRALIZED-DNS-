import crypto from "node:crypto";
import { getBalance } from "./credits.js";
import type { CreditsState } from "./receipts.js";

export type CommentHold = {
  ticket_id: string;
  wallet: string;
  site_id: string;
  post_id: string;
  amount: number;
  status: "held" | "submitted" | "approved" | "spam" | "trash";
  createdAt: number;
  expiresAt: number;
  comment_hash?: string;
};

export type CommentRate = { count: number; windowStart: number };

export type CommentState = {
  holds: Map<string, CommentHold>;
  walletRate: Map<string, CommentRate>;
  siteRate: Map<string, CommentRate>;
  walletCooldown: Map<string, number>;
};

export type CommentConfig = {
  holdTtlMs: number;
  maxPerMinuteWallet: number;
  maxPerMinuteSite: number;
  bonusMax: number;
  walletCooldownMs: number;
};

export type HoldResult =
  | { ok: true; ticket_id: string; expiresAt: number }
  | { ok: false; error: string };

export type SubmitResult = { ok: true } | { ok: false; error: string };

export type FinalizeResult =
  | { ok: true; wallet: string; balance: number }
  | { ok: false; error: string };

function applyRateLimit(
  map: Map<string, CommentRate>,
  key: string,
  maxPerMinute: number
): { ok: boolean; error?: string } {
  const now = Date.now();
  const entry = map.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > 60_000) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  map.set(key, entry);
  if (entry.count > maxPerMinute) return { ok: false, error: "RATE_LIMITED" };
  return { ok: true };
}

export function createHold(
  credits: CreditsState,
  comments: CommentState,
  payload: { wallet?: string; site_id?: string; post_id?: string; amount?: number },
  config: CommentConfig
): HoldResult {
  const wallet = (payload.wallet || "").trim();
  const site_id = (payload.site_id || "").trim();
  const post_id = (payload.post_id || "").trim();
  const amount = Number(payload.amount || 0);

  if (!wallet || !site_id || !post_id || !amount || amount <= 0) {
    return { ok: false, error: "INVALID_REQUEST" };
  }

  const walletRate = applyRateLimit(comments.walletRate, wallet, config.maxPerMinuteWallet);
  if (!walletRate.ok) return { ok: false, error: walletRate.error || "RATE_LIMITED" };

  const siteRate = applyRateLimit(comments.siteRate, site_id, config.maxPerMinuteSite);
  if (!siteRate.ok) return { ok: false, error: siteRate.error || "RATE_LIMITED" };

  const last = comments.walletCooldown.get(wallet) || 0;
  if (Date.now() - last < config.walletCooldownMs) {
    return { ok: false, error: "COOLDOWN_ACTIVE" };
  }

  const balance = getBalance(credits, wallet);
  if (balance < amount) return { ok: false, error: "INSUFFICIENT_CREDITS" };

  const ticket_id = `hold_${crypto.randomBytes(16).toString("hex")}`;
  const createdAt = Date.now();
  const expiresAt = createdAt + config.holdTtlMs;
  const hold: CommentHold = {
    ticket_id,
    wallet,
    site_id,
    post_id,
    amount,
    status: "held",
    createdAt,
    expiresAt
  };

  credits.credits.set(wallet, balance - amount);
  comments.walletCooldown.set(wallet, Date.now());
  comments.holds.set(ticket_id, hold);
  return { ok: true, ticket_id, expiresAt };
}

export function submitHold(
  comments: CommentState,
  payload: { ticket_id?: string; comment_hash?: string }
): SubmitResult {
  const ticket_id = (payload.ticket_id || "").trim();
  const comment_hash = (payload.comment_hash || "").trim();
  if (!ticket_id || !comment_hash) return { ok: false, error: "INVALID_REQUEST" };
  const hold = comments.holds.get(ticket_id);
  if (!hold) return { ok: false, error: "TICKET_NOT_FOUND" };
  if (hold.expiresAt < Date.now()) return { ok: false, error: "TICKET_EXPIRED" };
  hold.comment_hash = comment_hash;
  hold.status = "submitted";
  comments.holds.set(ticket_id, hold);
  return { ok: true };
}

export function finalizeHold(
  credits: CreditsState,
  comments: CommentState,
  payload: { ticket_id?: string; result?: string; bonus_multiplier?: number },
  config: CommentConfig
): FinalizeResult {
  const ticket_id = (payload.ticket_id || "").trim();
  const result = (payload.result || "").trim();
  if (!ticket_id || !result) return { ok: false, error: "INVALID_REQUEST" };
  const hold = comments.holds.get(ticket_id);
  if (!hold) return { ok: false, error: "TICKET_NOT_FOUND" };

  if (hold.expiresAt < Date.now()) {
    return { ok: false, error: "TICKET_EXPIRED" };
  }

  if (!["approved", "spam", "trash"].includes(result)) {
    return { ok: false, error: "INVALID_RESULT" };
  }

  const wallet = hold.wallet;
  let refund = 0;
  if (result === "approved") {
    const bonus = Math.min(
      Number(payload.bonus_multiplier || 1),
      config.bonusMax
    );
    const multiplier = Number.isFinite(bonus) && bonus >= 1 ? bonus : 1;
    refund = hold.amount * multiplier;
  }

  if (refund > 0) {
    const balance = getBalance(credits, wallet);
    credits.credits.set(wallet, balance + refund);
  }

  hold.status = result as CommentHold["status"];
  comments.holds.set(ticket_id, hold);
  return { ok: true, wallet, balance: getBalance(credits, wallet) };
}

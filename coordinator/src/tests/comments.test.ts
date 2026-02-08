import assert from "node:assert";
import type { CreditsState } from "../routes/receipts.js";
import { createHold, finalizeHold, submitHold, type CommentState } from "../routes/comments.js";

function createState(): CreditsState {
  return {
    receipts: new Map(),
    credits: new Map(),
    passports: new Set(),
    challenges: new Map(),
    rate: new Map()
  };
}

function createCommentState(): CommentState {
  return {
    holds: new Map(),
    walletRate: new Map(),
    siteRate: new Map(),
    walletCooldown: new Map()
  };
}

(() => {
  const credits = createState();
  const comments = createCommentState();
  credits.credits.set("0xabc", 5);

  const hold = createHold(
    credits,
    comments,
    { wallet: "0xabc", site_id: "site-1", post_id: "10", amount: 1 },
    { holdTtlMs: 900_000, maxPerMinuteWallet: 5, maxPerMinuteSite: 20, bonusMax: 3, walletCooldownMs: 0 }
  );
  assert.strictEqual(hold.ok, true);
  assert.strictEqual(credits.credits.get("0xabc"), 4);

  const submit = submitHold(comments, { ticket_id: (hold as any).ticket_id, comment_hash: "hash" });
  assert.strictEqual(submit.ok, true);

  const finalize = finalizeHold(
    credits,
    comments,
    { ticket_id: (hold as any).ticket_id, result: "approved", bonus_multiplier: 2 },
    { holdTtlMs: 900_000, maxPerMinuteWallet: 5, maxPerMinuteSite: 20, bonusMax: 3, walletCooldownMs: 0 }
  );
  assert.strictEqual(finalize.ok, true);
  assert.strictEqual(credits.credits.get("0xabc"), 5);

  console.log("comments coordinator tests passed");
})();

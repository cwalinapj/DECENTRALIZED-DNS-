import { describe, it, expect } from "vitest";
import { AttackMode, defaultThresholdsFromEnv, evaluateAttackMode, policyForMode } from "../src/index.js";

describe("attack mode evaluation", () => {
  it("enters SUSPICIOUS on high rpc fail", () => {
    const thr = defaultThresholdsFromEnv({
      ATTACK_RPC_FAIL_PCT: "30",
      ATTACK_INVALID_RECEIPT_PCT: "5",
      ATTACK_INVALID_RECEIPT_MIN_SAMPLE: "500",
      ATTACK_CANONICAL_FLIP_LIMIT: "2",
      ATTACK_RECOVERY_STABLE_SECS: "600"
    });
    const r = evaluateAttackMode(AttackMode.NORMAL, { rpcFailPct: 40, nowUnix: 1000 }, thr);
    expect(r.nextMode).toBe(AttackMode.SUSPICIOUS);
  });

  it("enters UNDER_ATTACK on invalid receipts", () => {
    const thr = defaultThresholdsFromEnv({
      ATTACK_RPC_FAIL_PCT: "30",
      ATTACK_INVALID_RECEIPT_PCT: "5",
      ATTACK_INVALID_RECEIPT_MIN_SAMPLE: "10",
      ATTACK_CANONICAL_FLIP_LIMIT: "2",
      ATTACK_RECOVERY_STABLE_SECS: "600"
    });
    const r = evaluateAttackMode(AttackMode.NORMAL, { invalidReceiptPct: 10, receiptSampleSize: 10, nowUnix: 1000 }, thr);
    expect(r.nextMode).toBe(AttackMode.UNDER_ATTACK);
    expect(policyForMode(r.nextMode).freezeWrites).toBe(true);
  });

  it("enters ISOLATED on rpc disagreement", () => {
    const thr = defaultThresholdsFromEnv({});
    const r = evaluateAttackMode(AttackMode.NORMAL, { rpcDisagreement: true, nowUnix: 1000 }, thr);
    expect(r.nextMode).toBe(AttackMode.ISOLATED);
  });

  it("requires stability time to exit UNDER_ATTACK", () => {
    const thr = defaultThresholdsFromEnv({
      ATTACK_RECOVERY_STABLE_SECS: "10"
    });
    const r1 = evaluateAttackMode(AttackMode.UNDER_ATTACK, { nowUnix: 1000, invalidReceiptPct: 10, receiptSampleSize: 1000 }, thr);
    expect(r1.nextMode).toBe(AttackMode.UNDER_ATTACK);
    const r2 = evaluateAttackMode(AttackMode.UNDER_ATTACK, { nowUnix: 1001 }, thr, r1.memory);
    expect(r2.nextMode).toBe(AttackMode.RECOVERY);
    const r3 = evaluateAttackMode(AttackMode.RECOVERY, { nowUnix: 1012 }, thr, r2.memory);
    expect(r3.nextMode).toBe(AttackMode.NORMAL);
  });
});


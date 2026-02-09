import { describe, it, expect } from "vitest";
import request from "supertest";

describe("miner-witness attack mode", () => {
  it("enters UNDER_ATTACK on invalid receipt flood and starts rejecting no-stake receipts", async () => {
    process.env.ATTACK_MODE_ENABLED = "1";
    process.env.ATTACK_INVALID_RECEIPT_MIN_SAMPLE = "10";
    process.env.ATTACK_INVALID_RECEIPT_PCT = "5";
    process.env.MINER_WITNESS_NO_LISTEN = "1";

    const { createApp } = await import("../src/index.js");
    const app = createApp();

    // First: submit a bunch of invalid receipts.
    const receipts = Array.from({ length: 10 }).map((_, i) => ({
      wallet: `w${i}`,
      valid: false,
      hasStake: false
    }));
    const r1 = await request(app).post("/v1/submit-receipts").send({ receipts });
    expect(r1.status).toBe(200);
    expect(["SUSPICIOUS", "UNDER_ATTACK"]).toContain(r1.body.mode);

    // Next: once in UNDER_ATTACK, policy requires stake => reject.
    // Push some more invalid to ensure threshold.
    const r2 = await request(app).post("/v1/submit-receipts").send({ receipts });
    expect(r2.status).toBe(200);
    expect(r2.body.mode).toBe("UNDER_ATTACK");

    const r3 = await request(app).post("/v1/submit-receipts").send({
      receipts: [{ wallet: "wa", valid: true, hasStake: false }]
    });
    expect(r3.status).toBe(200);
    // In UNDER_ATTACK, hasStake=false should be rejected.
    expect(r3.body.accepted).toBe(0);
    expect(r3.body.rejected).toBe(1);
  });
});

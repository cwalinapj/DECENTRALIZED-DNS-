import { describe, expect, it } from "vitest";
import { verifyEd25519Message } from "../credits/verify.js";
import { signReceipt } from "../credits/receipts.js";
import type { Receipt } from "../credits/types.js";

describe("credits hex validation", () => {
  it("rejects invalid hex chars in verifyEd25519Message", async () => {
    await expect(
      verifyEd25519Message("0xzz", "hello", "0x00")
    ).rejects.toThrow("invalid hex characters");
  });

  it("rejects invalid hex chars in signReceipt private key", async () => {
    const receipt: Receipt = {
      type: "SERVE",
      node_id: "node",
      ts: Math.floor(Date.now() / 1000)
    };
    await expect(signReceipt("0xzz", receipt)).rejects.toThrow(
      "invalid hex characters"
    );
  });
});

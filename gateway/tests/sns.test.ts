import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicKey, Connection } from "@solana/web3.js";
import { resolveSns } from "../src/adapters/sns.js";

const ownerKey = new PublicKey("BPFLoader1111111111111111111111111111111111");

describe("SNS adapter", () => {
  beforeEach(() => {
    vi.spyOn(Connection.prototype, "getAccountInfo").mockResolvedValue({
      owner: ownerKey
    } as any);
  });

  it("returns OWNER record", async () => {
    const records = await resolveSns("example.sol", { rpcUrl: "http://rpc", timeoutMs: 2000 });
    expect(records.length).toBe(1);
    expect(records[0].type).toBe("OWNER");
    expect(records[0].value).toBe(ownerKey.toBase58());
  });

  it("skips integration unless enabled", async () => {
    if (process.env.RUN_INTEGRATION !== "1") {
      expect(true).toBe(true);
      return;
    }
    const records = await resolveSns("bonfida.sol", {
      rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      timeoutMs: 4000
    });
    expect(Array.isArray(records)).toBe(true);
  });
});

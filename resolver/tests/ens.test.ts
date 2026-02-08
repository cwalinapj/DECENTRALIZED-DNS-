import { describe, it, expect, vi, beforeEach } from "vitest";
import { Interface } from "ethers";
import { resolveEns } from "../src/adaptors/ens.js";

const resolverIface = new Interface(["function resolver(bytes32 node) view returns (address)"]);
const addrIface = new Interface(["function addr(bytes32 node) view returns (address)"]);
const contentIface = new Interface(["function contenthash(bytes32 node) view returns (bytes)"]);

describe("ENS adapter", () => {
  beforeEach(() => {
    const responses = [
      resolverIface.encodeFunctionResult("resolver", ["0x0000000000000000000000000000000000001234"]),
      addrIface.encodeFunctionResult("addr", ["0x000000000000000000000000000000000000abcd"]),
      contentIface.encodeFunctionResult("contenthash", ["0x1234"]) // arbitrary bytes
    ];

    // @ts-expect-error test override
    globalThis.fetch = vi.fn(async () => {
      const result = responses.shift() || "0x";
      return {
        ok: true,
        json: async () => ({ result })
      } as any;
    });
  });

  it("returns addr + contenthash when present", async () => {
    const records = await resolveEns("example.eth", { rpcUrl: "http://rpc", timeoutMs: 2000 });
    const types = records.map((r) => r.type);
    expect(types).toContain("ADDR");
    expect(types).toContain("CONTENTHASH");
  });

  it("skips integration unless enabled", async () => {
    if (process.env.RUN_INTEGRATION !== "1") {
      expect(true).toBe(true);
      return;
    }
    const records = await resolveEns("vitalik.eth", {
      rpcUrl: process.env.ETH_RPC_URL || "",
      timeoutMs: 4000
    });
    expect(Array.isArray(records)).toBe(true);
  });
});

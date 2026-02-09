import { describe, it, expect } from "vitest";
import { createAdapterRegistry } from "../src/adapters/registry.js";
import type { Adapter } from "../src/adapters/shim.js";

function mkAdapter(kind: any, match: (name: string) => boolean, tag: string): Adapter {
  return {
    kind,
    async resolve(input) {
      if (!match(input.name)) return null;
      return {
        name: input.name.toLowerCase(),
        nameHashHex: "0x" + "11".repeat(32),
        dest: `${tag}:${input.name}`,
        destHashHex: "0x" + "22".repeat(32),
        ttlS: 60,
        source: { kind, ref: tag, confidenceBps: 10000 },
        proof: { type: "none", payload: { tag } }
      };
    }
  };
}

describe("adapter registry priority", () => {
  it(".dns tries pkdns first", async () => {
    const pkdns = mkAdapter("pkdns", (n) => n.endsWith(".dns"), "pkdns");
    const ens = mkAdapter("ens", (n) => n.endsWith(".dns"), "ens");
    const registry = createAdapterRegistry({ pkdns, ens, sns: mkAdapter("sns", () => false, "sns"), ipfs: mkAdapter("ipfs", () => false, "ipfs") });
    const ans = await registry.resolveAuto({ name: "alice.dns" });
    expect(ans.source.kind).toBe("pkdns");
    expect(ans.dest.startsWith("pkdns:")).toBe(true);
  });

  it("explicit source override works for non-.dns", async () => {
    const pkdns = mkAdapter("pkdns", () => false, "pkdns");
    const ens = mkAdapter("ens", (n) => n.endsWith(".eth"), "ens");
    const sns = mkAdapter("sns", (n) => n.endsWith(".sol"), "sns");
    const ipfs = mkAdapter("ipfs", (n) => n.startsWith("ipfs://"), "ipfs");
    const registry = createAdapterRegistry({ pkdns, ens, sns, ipfs });
    const ans = await registry.resolveWithSource({ name: "vitalik.eth", source: "ens" });
    expect(ans.source.kind).toBe("ens");
  });
});


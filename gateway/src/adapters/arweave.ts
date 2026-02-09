import type { Adapter } from "./shim.js";

export function createArweaveAdapterStub(): Adapter {
  return {
    kind: "arweave",
    async resolve(input) {
      if (input?.opts?.sourceOverride === "arweave") {
        throw new Error("NotImplemented:arweave");
      }
      return null;
    }
  };
}


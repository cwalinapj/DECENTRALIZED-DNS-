import type { Adapter } from "./shim.js";

export function createFilecoinAdapterStub(): Adapter {
  return {
    kind: "filecoin",
    async resolve(input) {
      if (input?.opts?.sourceOverride === "filecoin") {
        throw new Error("NotImplemented:filecoin");
      }
      return null;
    }
  };
}


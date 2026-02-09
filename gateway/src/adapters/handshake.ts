import type { Adapter } from "./shim.js";

export function createHandshakeAdapterStub(): Adapter {
  return {
    kind: "handshake",
    async resolve(input) {
      // Stub: return null unless explicitly requested, then throw a clear error.
      if (input?.opts?.sourceOverride === "handshake") {
        throw new Error("NotImplemented:handshake");
      }
      return null;
    }
  };
}


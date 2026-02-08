import { describe, expect, it } from "vitest";
import { computeResolveResultHash } from "../src/resolve_hash.js";

describe("computeResolveResultHash", () => {
  it("produces a stable base64 hash for a resolve payload", () => {
    const hash = computeResolveResultHash({
      name: "alice.dns",
      network: "dns",
      records: [
        { type: "OWNER", value: "owner_pubkey" },
        { type: "TEXT", value: "hello" }
      ]
    });
    expect(hash).toBe("BhOKfe4HRRhl/ep9URnPXr9ZKOODDit0k0rVu4tTiFc=");
  });
});

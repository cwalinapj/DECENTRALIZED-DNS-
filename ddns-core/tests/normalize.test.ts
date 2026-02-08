import { describe, it, expect } from "vitest";
import { normalizeName } from "../src/normalize.js";

describe("normalizeName", () => {
  it("lowercases and strips trailing dot", () => {
    expect(normalizeName("Api.Example.")).toBe("api.example");
  });

  it("punycode encodes unicode labels", () => {
    expect(normalizeName("Exämple.com")).toBe("xn--exmple-cua.com");
  });
});

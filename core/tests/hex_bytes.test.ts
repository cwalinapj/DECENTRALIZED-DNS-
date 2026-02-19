import { describe, it, expect } from "vitest";
import { fromHex, hex } from "../src/bytes.js";

describe("fromHex", () => {
  it("decodes valid even-length hex", () => {
    const bytes = fromHex("deadbeef");
    expect(hex(bytes)).toBe("deadbeef");
  });

  it("handles 0x prefix", () => {
    const bytes = fromHex("0xab01");
    expect(hex(bytes)).toBe("ab01");
  });

  it("throws on odd-length hex string", () => {
    expect(() => fromHex("abc")).toThrow("hex length must be even");
  });

  it("throws on odd-length hex with 0x prefix", () => {
    expect(() => fromHex("0xabc")).toThrow("hex length must be even");
  });
});

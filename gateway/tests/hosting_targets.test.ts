import { describe, expect, it } from "vitest";
import {
  decodeEnsContenthash,
  parseHostingTarget,
  selectTextHostingTarget
} from "../src/hosting/targets.js";

function encodeUvarint(value: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

describe("hosting target normalization", () => {
  it("normalizes raw CID to ipfs://", () => {
    const parsed = parseHostingTarget("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
    expect(parsed?.normalizedDest).toBe("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
  });

  it("normalizes raw arweave tx to ar://", () => {
    const parsed = parseHostingTarget("oB9jQ4g3yRi2sPvq4QTYuQdRrYWw4s7P1mXLfTzT3m4");
    expect(parsed?.normalizedDest).toBe("ar://oB9jQ4g3yRi2sPvq4QTYuQdRrYWw4s7P1mXLfTzT3m4");
  });

  it("decodes ENS contenthash ipfs payload", () => {
    const payload = Buffer.from([
      ...encodeUvarint(0xe3),
      0x12,
      0x20,
      ...new Array(32).fill(7)
    ]);
    const parsed = decodeEnsContenthash(`0x${payload.toString("hex")}`);
    expect(parsed?.scheme).toBe("ipfs");
    expect(parsed?.normalizedDest.startsWith("ipfs://")).toBe(true);
  });

  it("decodes ENS contenthash arweave payload", () => {
    const payload = Buffer.from([
      ...encodeUvarint(0xb29910),
      ...new Array(32).fill(5)
    ]);
    const parsed = decodeEnsContenthash(`0x${payload.toString("hex")}`);
    expect(parsed?.scheme).toBe("ar");
    expect(parsed?.normalizedDest.startsWith("ar://")).toBe(true);
  });

  it("honors text record selection order content > ipfs > arweave > url", () => {
    const selected = selectTextHostingTarget([
      { key: "url", value: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi" },
      { key: "arweave", value: "oB9jQ4g3yRi2sPvq4QTYuQdRrYWw4s7P1mXLfTzT3m4" },
      { key: "content", value: "QmYwAPJzv5CZsnAzt8auVTL7N9nM8YavNfVf2L8ZZrVSu2" }
    ]);
    expect(selected?.key).toBe("content");
    expect(selected?.normalizedDest.startsWith("ipfs://")).toBe(true);
  });
});

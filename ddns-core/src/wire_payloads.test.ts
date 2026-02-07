import { describe, it, expect } from "vitest";
import { encodeNOT, decodeNOT, encodeGSP, decodeGSP, encodeGET, decodeGET } from "../src/wire.js";

describe("wire v1 payload codecs", () => {
  it("NOT roundtrip", () => {
    const b = encodeNOT({ code: 3, retry: 15, msg: "BAD_REQUEST" });
    const o = decodeNOT(b);
    expect(o.code).toBe(3);
    expect(o.retry).toBe(15);
    expect(o.msg).toBe("BAD_REQUEST");
  });

  it("GSP roundtrip", () => {
    const name_id = new Uint8Array(32); name_id[31] = 1;
    const routeset_hash = new Uint8Array(32); routeset_hash[0] = 7;

    const b = encodeGSP({ name_id, seq: 2n, exp: 3n, routeset_hash, hops: 8 });
    const o = decodeGSP(b);
    expect(o.seq).toBe(2n);
    expect(o.exp).toBe(3n);
    expect(o.hops).toBe(8);
    expect(o.name_id[31]).toBe(1);
    expect(o.routeset_hash[0]).toBe(7);
  });

  it("GET roundtrip (mode 1 and 2)", () => {
    const name_id = new Uint8Array(32); name_id[0] = 1;
    const b1 = encodeGET({ mode: 1, name_id, seq: 9n });
    const o1 = decodeGET(b1);
    expect(o1.mode).toBe(1);
    if (o1.mode === 1) expect(o1.seq).toBe(9n);

    const hash = new Uint8Array(32); hash[0] = 2;
    const b2 = encodeGET({ mode: 2, hash });
    const o2 = decodeGET(b2);
    expect(o2.mode).toBe(2);
    if (o2.mode === 2) expect(o2.hash[0]).toBe(2);
  });
});

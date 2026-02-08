import { describe, it, expect } from "vitest";
import { encodePacket, decodePacket, MsgType, F_WANT_ANCHOR, encodeQRY, decodeQRY } from "../src/wire.js";

describe("wire v1 header/packet", () => {
  it("encodes/decodes packet + QRY payload", () => {
    const name_id = new Uint8Array(32); name_id[0] = 9;
    const qry = encodeQRY({ name_id, qtype: 1, min_seq: 10n });

    const packetBytes = encodePacket({
      header: {
        version: 1,
        msg_type: MsgType.QRY,
        flags: F_WANT_ANCHOR,
        req_id: 123,
        ns_id: 1,
        payload_len: qry.length
      },
      payload: qry
    });

    const pkt = decodePacket(packetBytes);
    expect(pkt.header.msg_type).toBe(MsgType.QRY);
    expect(pkt.header.flags & F_WANT_ANCHOR).toBeTruthy();
    expect(pkt.header.req_id).toBe(123);
    expect(pkt.header.ns_id).toBe(1);

    const decoded = decodeQRY(pkt.payload);
    expect(decoded.qtype).toBe(1);
    expect(decoded.min_seq).toBe(10n);
    expect(decoded.name_id[0]).toBe(9);
  });
});

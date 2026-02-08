import { decodePacket, MsgType, decodeANS, decodeANC, decodeNOT, decodePUT } from "./wire.js";
import { DEFAULT_LIMITS, WireLimits } from "./wire_limits.js";

export function parsePacketSafe(bytes: Uint8Array, limits: WireLimits = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };

  if (bytes.length > L.maxPacketBytes) throw new Error("packet exceeds maxPacketBytes");

  const pkt = decodePacket(bytes);

  if (pkt.header.payload_len > L.maxPayloadBytes) throw new Error("payload_len exceeds maxPayloadBytes");
  if (pkt.payload.length !== pkt.header.payload_len) throw new Error("payload length mismatch");

  // Message-specific checks
  switch (pkt.header.msg_type) {
    case MsgType.ANS: {
      const ans = decodeANS(pkt.payload);
      if (ans.routeset.length > L.maxRouteSetBytes) throw new Error("routeset exceeds maxRouteSetBytes");
      break;
    }
    case MsgType.ANC: {
      const anc = decodeANC(pkt.payload);
      if (anc.anchor.length > L.maxAnchorBytes) throw new Error("anchor exceeds maxAnchorBytes");
      break;
    }
    case MsgType.NOT: {
      const notp = decodeNOT(pkt.payload);
      if (notp.msg && new TextEncoder().encode(notp.msg).length > L.maxNotMsgBytes) {
        throw new Error("NOT msg exceeds maxNotMsgBytes");
      }
      break;
    }
    case MsgType.PUT: {
      const put = decodePUT(pkt.payload);
      if (put.routeset.length > L.maxRouteSetBytes) throw new Error("PUT routeset exceeds maxRouteSetBytes");
      break;
    }
    default:
      // other payloads are fixed size or validated in their decode functions
      break;
  }

  return pkt;
}

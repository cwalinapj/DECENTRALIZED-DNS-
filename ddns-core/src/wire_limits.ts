// Router-friendly defaults (tune per device).
export const DEFAULT_LIMITS = {
  maxPacketBytes: 64 * 1024,       // absolute cap
  maxPayloadBytes: 60 * 1024,      // cap payload_len
  maxRouteSetBytes: 48 * 1024,     // cap embedded RouteSet in ANS/PUT
  maxAnchorBytes: 1024,            // AnchorV1 is 217 bytes; allow some headroom
  maxNotMsgBytes: 1024,            // cap NOT message
};

export type WireLimits = Partial<typeof DEFAULT_LIMITS>;

import { describe, it, expect } from "vitest";
import { deriveNameId } from "../src/name_id.js";
import { ed25519KeypairFromSeed } from "../src/crypto_ed25519.js";
import { signRouteSetV1, encodeRouteSetV1, verifyRouteSetV1, routesetHash } from "../src/routeset.js";
import { buildAnchorV1, verifyAnchorV1, anchorMatchesRouteSet, decodeAnchorV1 } from "../src/anchor.js";

describe("RouteSetV1 + AnchorV1", () => {
  it("signs/verifies routeset and matches anchor", async () => {
    const seed = new Uint8Array(32); seed[0] = 7;
    const { pub, priv } = await ed25519KeypairFromSeed(seed);

    const ns_id = 1;
    const name_id = deriveNameId(ns_id, "api.example");

    const unsigned = {
      ns_id,
      name_id,
      seq: 1n,
      exp: 2000000000n,
      records: [
        { rr_type: 1, rr_class: 1, ttl: 300, rdata: new Uint8Array([203, 0, 113, 10]) } // A record
      ],
      owner_pub: pub
    };

    const signed = await signRouteSetV1(unsigned, priv);
    const rsBytes = encodeRouteSetV1(signed);

    expect(await verifyRouteSetV1(rsBytes)).toBe(true);

    const rsHash = routesetHash(rsBytes);
    const anchorBytes = await buildAnchorV1(
      { ns_id, name_id, seq: signed.seq, exp: signed.exp, routeset_hash: rsHash, owner_pub: pub },
      priv
    );

    expect(await verifyAnchorV1(anchorBytes)).toBe(true);
    expect(anchorMatchesRouteSet(anchorBytes, rsBytes)).toBe(true);

    const a = decodeAnchorV1(anchorBytes);
    expect(a.seq).toBe(1n);
  });
});

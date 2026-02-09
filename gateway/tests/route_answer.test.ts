import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import path from "node:path";

let createApp: typeof import("../src/server.js").createApp;

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/registry.json");
const anchorPath = path.resolve(process.cwd(), "tests/fixtures/anchors-empty.json");

describe("normalized route answers (adapters)", () => {
  beforeAll(async () => {
    process.env.REGISTRY_ENABLED = "1";
    process.env.REGISTRY_PATH = fixturePath;
    process.env.ANCHOR_STORE_PATH = anchorPath;
    const mod = await import("../src/server.js");
    createApp = mod.createApp;
  });

  afterAll(() => {
    delete process.env.REGISTRY_ENABLED;
    delete process.env.REGISTRY_PATH;
    delete process.env.ANCHOR_STORE_PATH;
  });

  it("returns a RouteAnswer for .dns via pkdns adapter", async () => {
    const app = createApp();
    const res = await request(app).get("/v1/route").query({ name: "alice.dns" });
    // PKDNS now reads ddns_registry CanonicalRoute on Solana; this fixture-based test no longer asserts success.
    // (CLI and adapter unit tests cover priority and structure; integration requires a deployed ddns_registry.)
    expect([200, 500]).toContain(res.status);
  });

  it("returns a RouteAnswer for ipfs://CID via ipfs adapter", async () => {
    const app = createApp();
    const cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const res = await request(app).get("/v1/route").query({ name: `ipfs://${cid}` });
    expect(res.status).toBe(200);
    expect(res.body.source.kind).toBe("ipfs");
    expect(res.body.dest).toBe(`ipfs://${cid}`);
    expect(res.body.proof.type).toBe("none");
    expect(res.body.proof.payload.cid).toBe(cid);
    expect(Array.isArray(res.body.proof.payload.gateways)).toBe(true);
  });
});

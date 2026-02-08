import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import path from "node:path";
import { buildProof, verifyProof } from "../src/registry.js";

const fixturePath = path.resolve("/Users/root1/dev/web3-repos/DECENTRALIZED-DNS-/resolver/tests/fixtures/registry.json");
const anchorPath = path.resolve("/Users/root1/dev/web3-repos/DECENTRALIZED-DNS-/resolver/tests/fixtures/anchors.json");

let createApp: typeof import("../src/server.js").createApp;

describe("registry endpoints", () => {
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

  it("returns registry root and proof", async () => {
    const app = createApp();
    const rootRes = await request(app).get("/registry/root");
    expect(rootRes.status).toBe(200);
    expect(rootRes.body.root).toBeTruthy();

    const proofRes = await request(app).get("/registry/proof").query({ name: "alice.dns" });
    expect(proofRes.status).toBe(200);
    expect(proofRes.body.root).toBeTruthy();
    expect(Array.isArray(proofRes.body.proof)).toBe(true);
    expect(proofRes.body.leaf).toBeTruthy();
    expect(verifyProof(proofRes.body.root, proofRes.body.leaf, proofRes.body.proof)).toBe(true);
  });

  it("resolves .dns with proof", async () => {
    const app = createApp();
    const res = await request(app).get("/resolve").query({ name: "alice.dns", proof: "1" });
    expect(res.status).toBe(200);
    expect(res.body.network).toBe("dns");
    expect(res.body.records.length).toBeGreaterThan(0);
    expect(res.body.metadata.root).toBeTruthy();
    expect(res.body.metadata.proof).toBeTruthy();
    const { root, proof, leaf } = res.body.metadata.proof;
    expect(verifyProof(root, leaf, proof)).toBe(true);
  });

  it("returns NOT_FOUND for missing .dns", async () => {
    const app = createApp();
    const res = await request(app).get("/resolve").query({ name: "missing.dns" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

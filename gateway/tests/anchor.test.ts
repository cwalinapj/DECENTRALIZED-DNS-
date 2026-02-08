import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import path from "node:path";
import fs from "node:fs";

const anchorPath = path.resolve(process.cwd(), "tests/fixtures/anchors.json");
const registryPath = path.resolve(process.cwd(), "tests/fixtures/registry.json");

let createApp: typeof import("../src/server.js").createApp;

describe("registry anchoring", () => {
  beforeAll(async () => {
    process.env.REGISTRY_ENABLED = "1";
    process.env.ANCHOR_STORE_PATH = anchorPath;
    process.env.REGISTRY_PATH = registryPath;
    process.env.REGISTRY_ADMIN_TOKEN = "testtoken";
    fs.writeFileSync(anchorPath, JSON.stringify({ latest: null, history: [] }, null, 2));
    const mod = await import("../src/server.js");
    createApp = mod.createApp;
  });

  afterAll(() => {
    delete process.env.REGISTRY_ENABLED;
    delete process.env.ANCHOR_STORE_PATH;
    delete process.env.REGISTRY_PATH;
    delete process.env.REGISTRY_ADMIN_TOKEN;
  });

  it("anchors a root and returns it via /registry/root", async () => {
    const app = createApp();
    const body = {
      root: "abc123",
      version: 1,
      timestamp: "2026-02-08T00:00:00Z",
      source: "git:test"
    };
    const res = await request(app)
      .post("/registry/anchor")
      .set("x-admin-token", "testtoken")
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.anchored.root).toBe("abc123");

    const rootRes = await request(app).get("/registry/root");
    expect(rootRes.status).toBe(200);
    expect(rootRes.body.anchoredRoot.root).toBe("abc123");
  });
});

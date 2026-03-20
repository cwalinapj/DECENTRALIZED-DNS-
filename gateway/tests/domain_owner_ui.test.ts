import { describe, expect, it, vi } from "vitest";
import request from "supertest";

async function loadApp() {
  vi.resetModules();
  const mod = await import("../src/server.js");
  return mod.createApp();
}

describe("domain-owner hosted UI", () => {
  it("serves the domain-owner control plane page", async () => {
    const app = await loadApp();
    const res = await request(app).get("/domain-owner/index.html");
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"] || "")).toContain("text/html");
    expect(res.text).toContain("Connect domain, verify ownership, set records, and watch continuity.");
    expect(res.text).toContain("Load overview");
    expect(res.text).toContain("/v1/domain/status");
    expect(res.text).toContain("/v1/registrar/domain");
  });
});

import { describe, expect, it, vi } from "vitest";
import request from "supertest";

async function loadApp() {
  vi.resetModules();
  const mod = await import("../src/server.js");
  return mod.createApp();
}

describe("domain continuity notice endpoints", () => {
  it("issues and verifies notice token", async () => {
    const app = await loadApp();
    const issue = await request(app).get("/v1/domain/notice").query({ domain: "example.com" });
    expect(issue.status).toBe(200);
    expect(issue.body.domain).toBe("example.com");
    expect(issue.body.phase).toBeTruthy();
    expect(issue.body.token).toBeTruthy();

    const verify = await request(app).post("/v1/domain/notice/verify").send({ token: issue.body.token });
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.payload.domain).toBe("example.com");
  });

  it("returns status payload with continuity fields", async () => {
    const app = await loadApp();
    const res = await request(app).get("/v1/domain/status").query({ domain: "example.com" });
    expect(res.status).toBe(200);
    expect(typeof res.body.eligible).toBe("boolean");
    expect(typeof res.body.phase).toBe("string");
    expect(Array.isArray(res.body.reason_codes)).toBe(true);
    expect(Array.isArray(res.body.next_steps)).toBe(true);
  });
});

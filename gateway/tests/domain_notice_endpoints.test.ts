import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";

const TEST_STORE_PATH = path.join(process.cwd(), "gateway/.cache/domain_status.test.json");

async function loadApp() {
  vi.resetModules();
  process.env.DOMAIN_STATUS_STORE_PATH = TEST_STORE_PATH;
  const mod = await import("../src/server.js");
  return mod.createApp();
}

describe("domain continuity notice endpoints", () => {
  it("returns verification challenge and status metadata", async () => {
    try { fs.unlinkSync(TEST_STORE_PATH); } catch {}
    const app = await loadApp();
    const verify = await request(app).post("/v1/domain/verify").send({ domain: "example.com" });
    expect(verify.status).toBe(200);
    expect(verify.body.txt_record_name).toContain("_tolldns-verify.example.com");
    expect(verify.body.auth_mode).toBe("stub");

    const status = await request(app)
      .get("/v1/domain/status")
      .query({ domain: "example.com" })
      .set("X-Owner-Pubkey", "ExampleOwnerPubkey");
    expect(status.status).toBe(200);
    expect(status.body.auth_mode).toBe("stub");
    expect(typeof status.body.auth_required).toBe("boolean");
    expect(status.body.owner_pubkey).toBe("ExampleOwnerPubkey");
    expect(status.body.txt_record_value).toContain("tolldns-verify=");
  });

  it("issues and verifies notice token", async () => {
    try { fs.unlinkSync(TEST_STORE_PATH); } catch {}
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
    try { fs.unlinkSync(TEST_STORE_PATH); } catch {}
    const app = await loadApp();
    const res = await request(app).get("/v1/domain/status").query({ domain: "example.com" });
    expect(res.status).toBe(200);
    expect(typeof res.body.eligible).toBe("boolean");
    expect(typeof res.body.phase).toBe("string");
    expect(Array.isArray(res.body.reason_codes)).toBe(true);
    expect(Array.isArray(res.body.next_steps)).toBe(true);
    expect(res.body.auth_mode).toBe("stub");
    expect(typeof res.body.auth_required).toBe("boolean");
  });
});

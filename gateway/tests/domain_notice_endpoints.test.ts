import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";

const TEST_STORE_PATH = path.join(process.cwd(), "gateway/.cache/domain_status.test.json");
const TEST_REGISTRAR_STORE_PATH = path.join(process.cwd(), "gateway/.cache/mock_registrar.test.json");

async function loadApp() {
  vi.resetModules();
  process.env.DOMAIN_STATUS_STORE_PATH = TEST_STORE_PATH;
  process.env.MOCK_REGISTRAR_STORE_PATH = TEST_REGISTRAR_STORE_PATH;
  const mod = await import("../src/server.js");
  return mod.createApp();
}

describe("domain continuity notice endpoints", () => {
  function resetStores() {
    try { fs.unlinkSync(TEST_STORE_PATH); } catch {}
    try { fs.unlinkSync(TEST_REGISTRAR_STORE_PATH); } catch {}
  }

  it("returns verification challenge and status metadata", async () => {
    resetStores();
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
    resetStores();
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

  it("renders HTML banner with injected token", async () => {
    resetStores();
    const app = await loadApp();
    const res = await request(app).get("/v1/domain/banner").query({ domain: "example.com" });
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"] || "")).toContain("text/html");
    expect(res.text).toContain("example.com");
    expect(res.text).toContain("Renew now");
    expect(res.text).toContain("/v1/domain/notice/verify");
  });

  it("returns status payload with continuity fields", async () => {
    resetStores();
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

  it("supports registrar adapter endpoints backed by mock store", async () => {
    resetStores();
    const app = await loadApp();

    const domainRes = await request(app).get("/v1/registrar/domain").query({ domain: "good-traffic.com" });
    expect(domainRes.status).toBe(200);
    expect(domainRes.body.status).toBe("expiring");

    const quoteRes = await request(app).get("/v1/registrar/quote").query({ domain: "good-traffic.com" });
    expect(quoteRes.status).toBe(200);
    expect(quoteRes.body.supported).toBe(true);

    const renewRes = await request(app)
      .post("/v1/registrar/renew")
      .send({ domain: "good-traffic.com", years: 1 });
    expect(renewRes.status).toBe(200);
    expect(renewRes.body.submitted).toBe(true);
  });
});

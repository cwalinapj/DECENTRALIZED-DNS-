import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";

const TEST_STORE_PATH = path.join(process.cwd(), "gateway/.cache/domain_status.test.json");
const TEST_REGISTRAR_STORE_PATH = path.join(process.cwd(), "gateway/.cache/mock_registrar.test.json");
const TEST_AUDIT_LOG_PATH = path.join(process.cwd(), "gateway/.cache/audit.test.jsonl");

async function loadApp() {
  vi.resetModules();
  process.env.DOMAIN_STATUS_STORE_PATH = TEST_STORE_PATH;
  process.env.MOCK_REGISTRAR_STORE_PATH = TEST_REGISTRAR_STORE_PATH;
  process.env.REGISTRAR_ENABLED = "0";
  process.env.REGISTRAR_PROVIDER = "mock";
  process.env.REGISTRAR_DRY_RUN = "1";
  process.env.RATE_LIMIT_WINDOW_S = "60";
  process.env.RATE_LIMIT_MAX_REQUESTS = "200";
  process.env.AUDIT_LOG_PATH = TEST_AUDIT_LOG_PATH;
  delete process.env.PORKBUN_API_KEY;
  delete process.env.PORKBUN_SECRET_API_KEY;
  const mod = await import("../src/server.js");
  return mod.createApp();
}

describe("domain continuity notice endpoints", () => {
  function resetStores() {
    try { fs.unlinkSync(TEST_STORE_PATH); } catch {}
    try { fs.unlinkSync(TEST_REGISTRAR_STORE_PATH); } catch {}
    try { fs.unlinkSync(TEST_AUDIT_LOG_PATH); } catch {}
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

  it("returns renewal-due banner state and supports ack", async () => {
    resetStores();
    const app = await loadApp();

    const due = await request(app).get("/v1/domain/banner").query({ domain: "low-traffic.com", format: "json" });
    expect(due.status).toBe(200);
    expect(due.body.domain).toBe("low-traffic.com");
    expect(due.body.banner_state).toBe("renewal_due");
    expect(String(due.body.banner_message)).toContain("Payment failed or renewal due");
    expect(typeof due.body.grace_seconds_remaining).toBe("number");
    expect(due.body.grace_seconds_remaining).toBeGreaterThan(0);

    const ack = await request(app).post("/v1/domain/banner/ack").send({ domain: "low-traffic.com" });
    expect(ack.status).toBe(200);
    expect(ack.body.ok).toBe(true);
    expect(typeof ack.body.acked_at).toBe("string");

    const afterAck = await request(app).get("/v1/domain/banner").query({ domain: "low-traffic.com", format: "json" });
    expect(afterAck.status).toBe(200);
    expect(afterAck.body.acked_at).toBe(ack.body.acked_at);
  });

  it("uses Cloudflare worker expiration date to trigger renewal banner", async () => {
    resetStores();
    vi.resetModules();
    process.env.DOMAIN_STATUS_STORE_PATH = TEST_STORE_PATH;
    process.env.MOCK_REGISTRAR_STORE_PATH = TEST_REGISTRAR_STORE_PATH;
    process.env.REGISTRAR_ENABLED = "0";
    process.env.REGISTRAR_PROVIDER = "mock";
    process.env.REGISTRAR_DRY_RUN = "1";
    process.env.DOMAIN_EXPIRY_WORKER_URL = "https://expiry-worker.example.workers.dev/check";
    // @ts-expect-error test mock
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target.includes("expiry-worker.example.workers.dev") && target.includes("domain=active.com")) {
        return new Response(
          JSON.stringify({ domain: "active.com", expires_at: "2020-01-01T00:00:00Z" }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ expires_at: "2999-01-01T00:00:00Z" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const mod = await import("../src/server.js");
    const app = mod.createApp();

    const due = await request(app).get("/v1/domain/banner").query({ domain: "active.com", format: "json" });
    expect(due.status).toBe(200);
    expect(due.body.domain).toBe("active.com");
    expect(due.body.banner_state).toBe("renewal_due");
    expect(String(due.body.banner_message)).toContain("Payment failed or renewal due");
    expect(String(due.body.renewal_due_date || "")).toContain("2020-01-01");
    expect(globalThis.fetch).toHaveBeenCalled();

    vi.restoreAllMocks();
    delete process.env.DOMAIN_EXPIRY_WORKER_URL;
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
    expect(typeof res.body.uses_ddns_ns).toBe("boolean");
    expect(typeof res.body.eligible_for_hold).toBe("boolean");
    expect(typeof res.body.eligible_for_subsidy).toBe("boolean");
    expect(res.body.uses_ddns_ns).toBe(false);
    expect(res.body.eligible_for_hold).toBe(false);
    expect(res.body.eligible_for_subsidy).toBe(false);
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
    expect(renewRes.body.status).toBe("submitted");
  });

  it("supports real-provider dry-run mode without secrets", async () => {
    resetStores();
    vi.resetModules();
    process.env.DOMAIN_STATUS_STORE_PATH = TEST_STORE_PATH;
    process.env.MOCK_REGISTRAR_STORE_PATH = TEST_REGISTRAR_STORE_PATH;
    process.env.REGISTRAR_ENABLED = "1";
    process.env.REGISTRAR_PROVIDER = "porkbun";
    process.env.REGISTRAR_DRY_RUN = "1";
    delete process.env.PORKBUN_API_KEY;
    delete process.env.PORKBUN_SECRET_API_KEY;
    const mod = await import("../src/server.js");
    const app = mod.createApp();

    const res = await request(app).get("/v1/registrar/domain").query({ domain: "example.com" });
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("porkbun");
    expect(res.body.dry_run).toBe(true);
  });

  it("returns insufficient_credits response when coverage is too low", async () => {
    resetStores();
    const app = await loadApp();

    const renewRes = await request(app)
      .post("/v1/registrar/renew")
      .send({ domain: "low-traffic.com", years: 1 });
    expect(renewRes.status).toBe(200);
    expect(renewRes.body.status).toBe("insufficient_credits");
    expect(typeof renewRes.body.remaining_usd).toBe("number");
    expect(renewRes.body.remaining_usd).toBeGreaterThan(0);
  });

  it("rate limits registrar endpoints and writes audit log entries", async () => {
    resetStores();
    vi.resetModules();
    process.env.DOMAIN_STATUS_STORE_PATH = TEST_STORE_PATH;
    process.env.MOCK_REGISTRAR_STORE_PATH = TEST_REGISTRAR_STORE_PATH;
    process.env.AUDIT_LOG_PATH = TEST_AUDIT_LOG_PATH;
    process.env.REGISTRAR_ENABLED = "0";
    process.env.REGISTRAR_PROVIDER = "mock";
    process.env.REGISTRAR_DRY_RUN = "1";
    process.env.RATE_LIMIT_WINDOW_S = "60";
    process.env.RATE_LIMIT_MAX_REQUESTS = "2";
    const mod = await import("../src/server.js");
    const app = mod.createApp();

    const r1 = await request(app).get("/v1/registrar/domain").query({ domain: "example.com" });
    const r2 = await request(app).get("/v1/registrar/domain").query({ domain: "example.com" });
    const r3 = await request(app).get("/v1/registrar/domain").query({ domain: "example.com" });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);

    const auditText = fs.readFileSync(TEST_AUDIT_LOG_PATH, "utf8");
    expect(auditText).toContain("\"endpoint\":\"/v1/registrar/domain\"");
    expect(auditText).toContain("\"decision\":\"rate_limited\"");
  });
});

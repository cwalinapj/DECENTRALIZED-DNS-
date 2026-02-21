import { describe, expect, it, vi } from "vitest";
import request from "supertest";

async function loadApp(lockSeconds = "120") {
  vi.resetModules();
  process.env.PAY_QUOTE_LOCK_SECONDS = lockSeconds;
  const mod = await import("../src/server.js");
  return mod.createApp();
}

describe("GET /v1/pay/quote", () => {
  it("returns quote with expiry and rails", async () => {
    const app = await loadApp("90");
    const now = Date.now();

    const res = await request(app).get("/v1/pay/quote").query({ sku: "renewal-basic", currency: "USD" });

    expect(res.status).toBe(200);
    expect(res.body.quote_id).toMatch(/^quote_/);
    expect(res.body.usd_price).toBe(12);
    expect(res.body.disclaimer).toBe("Quote expires; refresh on expiry");
    expect(res.body.pay_rails).toEqual(["card", "ach", "usdc", "sol", "eth", "btc"]);
    const expiresAt = Date.parse(String(res.body.expires_at));
    expect(expiresAt).toBeGreaterThanOrEqual(now + 80_000);
    expect(expiresAt).toBeLessThanOrEqual(now + 95_000);
  });

  it("accepts supported currencies and rejects invalid currency", async () => {
    const app = await loadApp();

    const ok = await request(app).get("/v1/pay/quote").query({ sku: "hosting-basic", currency: "BTC" });
    expect(ok.status).toBe(200);
    expect(ok.body.currency).toBe("BTC");
    expect(ok.body.usd_price).toBe(5);

    const bad = await request(app).get("/v1/pay/quote").query({ sku: "hosting-basic", currency: "DOGE" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_currency");
  });
});

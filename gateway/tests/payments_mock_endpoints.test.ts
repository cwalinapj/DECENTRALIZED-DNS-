import { describe, expect, it, vi } from "vitest";
import request from "supertest";

async function loadApp(enabled: boolean) {
  vi.resetModules();
  process.env.PAYMENTS_PROVIDER = "mock";
  process.env.PAYMENTS_MOCK_ENABLED = enabled ? "1" : "0";
  const mod = await import("../src/server.js");
  return mod.createApp();
}

describe("mock payments endpoints", () => {
  it("supports quote -> checkout -> paid transition", async () => {
    const app = await loadApp(true);

    const quote = await request(app).post("/v1/payments/quote").send({
      sku: "renewal-basic",
      money: { amountCents: 2500, currency: "USD" },
      rails: ["card", "usdc"]
    });
    expect(quote.status).toBe(200);
    expect(quote.body.id).toMatch(/^quote_/);
    expect(Array.isArray(quote.body.rails)).toBe(true);

    const checkout = await request(app).post("/v1/payments/checkout").send({
      quoteId: quote.body.id,
      rail: "card",
      returnUrl: "https://example.com/return"
    });
    expect(checkout.status).toBe(200);
    expect(checkout.body.id).toMatch(/^checkout_/);
    expect(checkout.body.url).toContain(`/mock-pay/checkout/${checkout.body.id}`);

    const pending = await request(app).get("/v1/payments/status").query({ id: checkout.body.id });
    expect(pending.status).toBe(200);
    expect(pending.body.status).toBe("pending");

    const paid = await request(app).post("/mock-pay/mark-paid").query({ id: checkout.body.id });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("paid");

    const final = await request(app).get("/v1/payments/status").query({ id: checkout.body.id });
    expect(final.status).toBe(200);
    expect(final.body.status).toBe("paid");
  });

  it("returns disabled when mock payments flag is off", async () => {
    const app = await loadApp(false);
    const res = await request(app).post("/v1/payments/quote").send({
      sku: "renewal-basic",
      money: { amountCents: 1000, currency: "USD" },
      rails: ["card"]
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("payments_disabled");
  });
});

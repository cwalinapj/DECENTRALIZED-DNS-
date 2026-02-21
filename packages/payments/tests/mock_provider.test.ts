import { describe, expect, it } from "vitest";
import { createMockPaymentsProvider } from "../src/index.js";

describe("MockPaymentsProvider", () => {
  it("creates quote with rails and expiry", async () => {
    const provider = createMockPaymentsProvider();
    const quote = await provider.createQuote({
      sku: "renewal-basic",
      money: { amountCents: 1299, currency: "USD" },
      rails: ["card", "usdc"]
    });
    expect(quote.id).toMatch(/^quote_/);
    expect(quote.rails).toEqual(["card", "usdc"]);
    expect(quote.display.payWith.card).toBe("Card");
    expect(Date.parse(quote.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("creates checkout session with local mock url", async () => {
    const provider = createMockPaymentsProvider();
    const quote = await provider.createQuote({
      sku: "renewal-basic",
      money: { amountCents: 1299, currency: "USD" },
      rails: ["ach", "sol"]
    });
    const checkout = await provider.createCheckout({
      quoteId: quote.id,
      rail: "ach",
      returnUrl: "https://example.com/return"
    });
    expect(checkout.id).toMatch(/^checkout_/);
    expect(checkout.url).toContain(`/mock-pay/checkout/${checkout.id}`);
    expect(checkout.rail).toBe("ach");
  });

  it("transitions from pending to paid when marked paid", async () => {
    const provider = createMockPaymentsProvider();
    const quote = await provider.createQuote({
      sku: "renewal-basic",
      money: { amountCents: 1299, currency: "USD" },
      rails: ["card"]
    });
    const checkout = await provider.createCheckout({
      quoteId: quote.id,
      rail: "card",
      returnUrl: "https://example.com/return"
    });

    expect(await provider.getStatus(checkout.id)).toBe("pending");
    expect(provider.markPaid(checkout.id)).toBe(true);
    expect(await provider.getStatus(checkout.id)).toBe("paid");
  });
});

import crypto from "node:crypto";

export type Money = {
  amountCents: number;
  currency: "USD";
};

export type PaymentRail = "card" | "ach" | "usdc" | "sol" | "eth" | "btc" | "other";

export type QuoteRequest = {
  sku: string;
  money: Money;
  rails: PaymentRail[];
  customerHint?: string;
};

export type Quote = {
  id: string;
  money: Money;
  expiresAt: string;
  rails: PaymentRail[];
  display: {
    payWith: Record<PaymentRail, string>;
  };
};

export type CheckoutRequest = {
  quoteId: string;
  rail: PaymentRail;
  returnUrl: string;
};

export type CheckoutSession = {
  id: string;
  rail: PaymentRail;
  url: string;
  expiresAt: string;
};

export type WebhookEvent = {
  provider: string;
  type: string;
  raw: unknown;
};

export type PaymentStatus = "pending" | "paid" | "expired" | "failed" | "refunded";

export interface PaymentsProvider {
  createQuote(req: QuoteRequest): Promise<Quote>;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  getStatus(id: string): Promise<PaymentStatus>;
  verifyWebhook(event: WebhookEvent): Promise<boolean>;
}

type QuoteRecord = {
  quote: Quote;
  status: PaymentStatus;
};

type CheckoutRecord = {
  checkout: CheckoutSession;
  quoteId: string;
  status: PaymentStatus;
};

export type MockPaymentsProvider = PaymentsProvider & {
  markPaid(checkoutId: string): boolean;
};

const MOCK_QUOTE_TTL_MS = 120 * 1000;

const DISPLAY_LABELS: Record<PaymentRail, string> = {
  card: "Card",
  ach: "ACH",
  usdc: "USDC",
  sol: "SOL",
  eth: "ETH",
  btc: "BTC",
  other: "Other"
};

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function paymentLabels(rails: PaymentRail[]): Record<PaymentRail, string> {
  const output: Record<PaymentRail, string> = { ...DISPLAY_LABELS };
  for (const rail of rails) {
    output[rail] = DISPLAY_LABELS[rail];
  }
  return output;
}

function ensureUsd(money: Money): void {
  if (money.currency !== "USD") throw new Error("unsupported_currency");
  if (!Number.isFinite(money.amountCents) || money.amountCents <= 0) throw new Error("invalid_amount");
}

function isExpired(expiresAt: string): boolean {
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now();
}

export function createMockPaymentsProvider(now = () => Date.now()): MockPaymentsProvider {
  const quotes = new Map<string, QuoteRecord>();
  const checkouts = new Map<string, CheckoutRecord>();

  return {
    async createQuote(req: QuoteRequest): Promise<Quote> {
      if (!req?.sku || typeof req.sku !== "string") throw new Error("invalid_sku");
      ensureUsd(req.money);
      if (!Array.isArray(req.rails) || req.rails.length === 0) throw new Error("invalid_rails");
      const id = makeId("quote");
      const expiresAt = new Date(now() + MOCK_QUOTE_TTL_MS).toISOString();
      const quote: Quote = {
        id,
        money: req.money,
        expiresAt,
        rails: [...req.rails],
        display: {
          payWith: paymentLabels(req.rails)
        }
      };
      quotes.set(id, { quote, status: "pending" });
      return quote;
    },

    async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
      const quoteRecord = quotes.get(req.quoteId);
      if (!quoteRecord) throw new Error("quote_not_found");
      if (isExpired(quoteRecord.quote.expiresAt)) {
        quoteRecord.status = "expired";
        quotes.set(req.quoteId, quoteRecord);
        throw new Error("quote_expired");
      }
      if (!quoteRecord.quote.rails.includes(req.rail)) throw new Error("rail_not_supported");
      const id = makeId("checkout");
      const checkout: CheckoutSession = {
        id,
        rail: req.rail,
        url: `/mock-pay/checkout/${id}`,
        expiresAt: quoteRecord.quote.expiresAt
      };
      checkouts.set(id, {
        checkout,
        quoteId: req.quoteId,
        status: "pending"
      });
      return checkout;
    },

    async getStatus(id: string): Promise<PaymentStatus> {
      const checkoutRecord = checkouts.get(id);
      if (!checkoutRecord) return "failed";
      if (checkoutRecord.status === "pending" && isExpired(checkoutRecord.checkout.expiresAt)) {
        checkoutRecord.status = "expired";
        checkouts.set(id, checkoutRecord);
      }
      return checkoutRecord.status;
    },

    async verifyWebhook(_event: WebhookEvent): Promise<boolean> {
      return true;
    },

    markPaid(checkoutId: string): boolean {
      const checkoutRecord = checkouts.get(checkoutId);
      if (!checkoutRecord) return false;
      if (isExpired(checkoutRecord.checkout.expiresAt)) {
        checkoutRecord.status = "expired";
        checkouts.set(checkoutId, checkoutRecord);
        return false;
      }
      checkoutRecord.status = "paid";
      checkouts.set(checkoutId, checkoutRecord);
      return true;
    }
  };
}

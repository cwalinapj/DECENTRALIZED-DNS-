import fs from "node:fs";
import path from "node:path";
import type {
  DnsUpdateResult,
  DomainName,
  RegistrarAdapter,
  RegistrarDomainRecord,
  RegistrarPayment,
  RenewalQuote,
  RenewalResult
} from "./adapter.js";

type MockRegistrarStore = {
  domains: Record<string, RegistrarDomainRecord>;
};

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function defaultStore(): MockRegistrarStore {
  const now = Date.now();
  return {
    domains: {
      "good-traffic.com": {
        domain: "good-traffic.com",
        status: "expiring",
        renewal_due_date: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
        grace_expires_at: new Date(now + 37 * 24 * 60 * 60 * 1000).toISOString(),
        ns: ["ns1.tolldns.io", "ns2.tolldns.io"],
        traffic_signal: "real",
        credits_balance: 180
      },
      "low-traffic.com": {
        domain: "low-traffic.com",
        status: "expired",
        renewal_due_date: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        grace_expires_at: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
        ns: ["ns1.tolldns.io", "ns2.tolldns.io"],
        traffic_signal: "low",
        credits_balance: 20
      },
      "active.com": {
        domain: "active.com",
        status: "active",
        renewal_due_date: new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString(),
        grace_expires_at: new Date(now + 210 * 24 * 60 * 60 * 1000).toISOString(),
        ns: ["ns1.tolldns.io", "ns2.tolldns.io"],
        traffic_signal: "real",
        credits_balance: 75
      }
    }
  };
}

function ensureStore(filePath: string): MockRegistrarStore {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const seeded = defaultStore();
    fs.writeFileSync(filePath, JSON.stringify(seeded, null, 2) + "\n", "utf8");
    return seeded;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as MockRegistrarStore;
  if (!parsed.domains || typeof parsed.domains !== "object") return defaultStore();
  return parsed;
}

function saveStore(filePath: string, store: MockRegistrarStore): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function createMockRegistrar(filePath = path.resolve(process.cwd(), "gateway/.cache/mock_registrar.json")): RegistrarAdapter {
  return {
    async getDomain(domain: DomainName): Promise<RegistrarDomainRecord> {
      const key = normalizeDomain(domain);
      const store = ensureStore(filePath);
      const existing = store.domains[key];
      if (existing) return existing;
      return { domain: key, status: "unknown", ns: [], traffic_signal: "none", credits_balance: 0 };
    },

    async getRenewalQuote(domain: DomainName): Promise<RenewalQuote> {
      const record = await this.getDomain(domain);
      const baseUsd = record.status === "expired" ? 14 : 11;
      const solUsd = 100;
      return {
        price_usd: baseUsd,
        price_sol: Number((baseUsd / solUsd).toFixed(4)),
        supported: record.status !== "unknown",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      };
    },

    async renewDomain(domain: DomainName, years: number, payment?: RegistrarPayment): Promise<RenewalResult> {
      const key = normalizeDomain(domain);
      if (!Number.isFinite(years) || years < 1) {
        return { submitted: false, provider_ref: "mock-renew-invalid", errors: ["invalid_years"] };
      }
      const store = ensureStore(filePath);
      const existing =
        store.domains[key] || { domain: key, status: "unknown", ns: [], traffic_signal: "none", credits_balance: 0 };
      if (existing.status === "unknown") {
        return { submitted: false, provider_ref: "mock-renew-unsupported", errors: ["domain_unknown"] };
      }
      const now = Date.now();
      const due = new Date(now + years * 365 * 24 * 60 * 60 * 1000).toISOString();
      store.domains[key] = {
        ...existing,
        status: "active",
        renewal_due_date: due,
        grace_expires_at: new Date(now + (years * 365 + 30) * 24 * 60 * 60 * 1000).toISOString(),
        credits_balance: Math.max(0, (existing.credits_balance || 0) - (payment?.credits_amount || 0))
      };
      saveStore(filePath, store);
      return { submitted: true, provider_ref: `mock-renew-${Date.now()}`, errors: [] };
    },

    async setNameServers(domain: DomainName, ns: string[]): Promise<DnsUpdateResult> {
      const key = normalizeDomain(domain);
      const normalized = ns.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
      if (normalized.length < 2) {
        return { ok: false, provider_ref: "mock-ns-invalid", errors: ["invalid_ns"] };
      }
      const store = ensureStore(filePath);
      const existing =
        store.domains[key] || { domain: key, status: "unknown", ns: [], traffic_signal: "none", credits_balance: 0 };
      store.domains[key] = { ...existing, ns: normalized };
      saveStore(filePath, store);
      return { ok: true, provider_ref: `mock-ns-${Date.now()}`, errors: [] };
    },

    async getNameServers(domain: DomainName): Promise<{ ns: string[] }> {
      const record = await this.getDomain(domain);
      return { ns: record.ns || [] };
    }
  };
}

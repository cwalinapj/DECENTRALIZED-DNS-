import type { RegistrarAdapter, RegistrarDomainRecord, RenewalQuote, RenewalResult, DnsUpdateResult } from "./registrar_mock.js";

type PorkbunOptions = {
  apiKey?: string;
  secretApiKey?: string;
  endpoint?: string;
  dryRun?: boolean;
  timeoutMs?: number;
};

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function baseUrl(endpoint?: string): string {
  return (endpoint || "https://api.porkbun.com/api/json/v3").replace(/\/+$/, "");
}

function hasCreds(opts: PorkbunOptions): boolean {
  return Boolean(opts.apiKey && opts.secretApiKey);
}

function providerRef(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

async function postJson<T>(url: string, body: Record<string, unknown>, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const json = (await res.json()) as T;
    if (!res.ok) throw new Error(`provider_http_${res.status}`);
    return json;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("provider_timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function creds(opts: PorkbunOptions) {
  return { apikey: String(opts.apiKey || ""), secretapikey: String(opts.secretApiKey || "") };
}

function dryRunDomain(domain: string): RegistrarDomainRecord {
  return {
    domain,
    status: domain === "good-traffic.com" ? "expiring" : "active",
    renewal_due_date: new Date(Date.now() + (domain === "good-traffic.com" ? 5 : 90) * 24 * 60 * 60 * 1000).toISOString(),
    grace_expires_at: new Date(Date.now() + (domain === "good-traffic.com" ? 35 : 120) * 24 * 60 * 60 * 1000).toISOString(),
    ns: ["ns1.tolldns.io", "ns2.tolldns.io"],
    traffic_signal: domain === "good-traffic.com" ? "real" : "low",
    credits_balance: domain === "good-traffic.com" ? 180 : 40
  };
}

export function createPorkbunRegistrarAdapter(opts: PorkbunOptions = {}): RegistrarAdapter {
  const endpoint = baseUrl(opts.endpoint);
  const dryRun = Boolean(opts.dryRun || !hasCreds(opts));
  const timeoutMs = Number(opts.timeoutMs || 6000);

  return {
    async getDomain(domainRaw: string): Promise<RegistrarDomainRecord> {
      const domain = normalizeDomain(domainRaw);
      if (dryRun) return dryRunDomain(domain);
      const result = await postJson<any>(`${endpoint}/domain/getDomainInfo/${domain}`, creds(opts), timeoutMs);
      const statusRaw = String(result?.status || "").toLowerCase();
      const expiration = result?.domain?.expirationDate || result?.domain?.expireDate || Date.now() + 90 * 24 * 60 * 60 * 1000;
      const trafficEstimate = Number(result?.domain?.estimatedTraffic || 0);
      return {
        domain,
        status:
          statusRaw === "active" || statusRaw === "expiring" || statusRaw === "expired" || statusRaw === "redemption"
            ? statusRaw
            : "unknown",
        renewal_due_date: new Date(expiration).toISOString(),
        grace_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ns: Array.isArray(result?.domain?.ns) ? result.domain.ns : [],
        traffic_signal: trafficEstimate <= 0 ? "none" : trafficEstimate < 200 ? "low" : "real",
        credits_balance: 0
      };
    },

    async getRenewalQuote(domainRaw: string): Promise<RenewalQuote> {
      const domain = normalizeDomain(domainRaw);
      if (dryRun) {
        const priceUsd = domain.length <= 6 ? 14 : 11;
        return {
          price_usd: priceUsd,
          price_sol: Number((priceUsd / 100).toFixed(4)),
          supported: true,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        };
      }
      const result = await postJson<any>(`${endpoint}/domain/getPricing/${domain}`, creds(opts), timeoutMs);
      const priceUsd = Number(result?.pricing?.renew || 12);
      return {
        price_usd: priceUsd,
        price_sol: Number((priceUsd / 100).toFixed(4)),
        supported: true,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      };
    },

    async renewDomain(domainRaw: string, years: number, payment?: { payment_method?: string }): Promise<RenewalResult> {
      const domain = normalizeDomain(domainRaw);
      if (!Number.isFinite(years) || years < 1) {
        return { submitted: false, provider_ref: providerRef("porkbun-invalid"), errors: ["invalid_years"] };
      }
      if (dryRun) return { submitted: true, provider_ref: providerRef("porkbun-dryrun-renew"), errors: [] };
      const result = await postJson<any>(
        `${endpoint}/domain/renew/${domain}`,
        { ...creds(opts), years, payment_method: payment?.payment_method || "credits" },
        timeoutMs
      );
      if (String(result?.status || "").toLowerCase() !== "success") {
        return { submitted: false, provider_ref: providerRef("porkbun-renew"), errors: [String(result?.message || "renew_failed")] };
      }
      return { submitted: true, provider_ref: providerRef("porkbun-renew"), errors: [] };
    },

    async setNameServers(domainRaw: string, ns: string[]): Promise<DnsUpdateResult> {
      const domain = normalizeDomain(domainRaw);
      const normalized = ns.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
      if (normalized.length < 2) {
        return { ok: false, provider_ref: providerRef("porkbun-ns"), errors: ["invalid_ns"] };
      }
      if (dryRun) return { ok: true, provider_ref: providerRef("porkbun-dryrun-ns"), errors: [] };
      const result = await postJson<any>(`${endpoint}/domain/updateNs/${domain}`, { ...creds(opts), ns: normalized }, timeoutMs);
      if (String(result?.status || "").toLowerCase() !== "success") {
        return { ok: false, provider_ref: providerRef("porkbun-ns"), errors: [String(result?.message || "ns_failed")] };
      }
      return { ok: true, provider_ref: providerRef("porkbun-ns"), errors: [] };
    },

    async getNameServers(domainRaw: string): Promise<{ ns: string[] }> {
      const domain = normalizeDomain(domainRaw);
      if (dryRun) return { ns: ["ns1.tolldns.io", "ns2.tolldns.io"] };
      const result = await postJson<any>(`${endpoint}/domain/getNs/${domain}`, creds(opts), timeoutMs);
      const ns = Array.isArray(result?.ns) ? result.ns : [];
      return { ns: ns.map((entry: unknown) => String(entry || "").toLowerCase()).filter(Boolean) };
    }
  };
}

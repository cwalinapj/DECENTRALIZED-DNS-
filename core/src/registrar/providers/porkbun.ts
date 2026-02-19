import type {
  DnsUpdateResult,
  DomainName,
  RegistrarAdapter,
  RegistrarDomainRecord,
  RegistrarPayment,
  RenewalQuote,
  RenewalResult
} from "../adapter.js";

type PorkbunOpts = {
  apiKey?: string;
  secretApiKey?: string;
  endpoint?: string;
  dryRun?: boolean;
};

type PorkbunCreds = { apikey: string; secretapikey: string };

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function baseUrl(endpoint?: string): string {
  return (endpoint || "https://api.porkbun.com/api/json/v3").replace(/\/+$/, "");
}

function providerRef(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

function hasCreds(opts: PorkbunOpts): boolean {
  return Boolean(opts.apiKey && opts.secretApiKey);
}

function renewalDueEstimate(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function toTrafficSignal(estimate?: number): "none" | "low" | "real" {
  if (!estimate || estimate <= 0) return "none";
  if (estimate < 200) return "low";
  return "real";
}

function dryRunDomain(domain: string): RegistrarDomainRecord {
  return {
    domain,
    status: domain === "good-traffic.com" ? "expiring" : "active",
    renewal_due_date: renewalDueEstimate(domain === "good-traffic.com" ? 5 : 90),
    grace_expires_at: renewalDueEstimate(domain === "good-traffic.com" ? 35 : 120),
    ns: ["ns1.tolldns.io", "ns2.tolldns.io"],
    traffic_signal: domain === "good-traffic.com" ? "real" : "low",
    credits_balance: domain === "good-traffic.com" ? 180 : 40
  };
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const json = (await res.json()) as T;
    if (!res.ok) {
      throw new Error(`provider_http_${res.status}`);
    }
    return json;
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("provider_timeout");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function creds(opts: PorkbunOpts): PorkbunCreds {
  return { apikey: String(opts.apiKey || ""), secretapikey: String(opts.secretApiKey || "") };
}

export function createPorkbunRegistrarAdapter(opts: PorkbunOpts = {}): RegistrarAdapter {
  const endpoint = baseUrl(opts.endpoint);
  const dryRun = Boolean(opts.dryRun || !hasCreds(opts));

  return {
    async getDomain(domainRaw: DomainName): Promise<RegistrarDomainRecord> {
      const domain = normalizeDomain(domainRaw);
      if (dryRun) return dryRunDomain(domain);

      const result = await postJson<any>(`${endpoint}/domain/getDomainInfo/${domain}`, creds(opts));
      const statusRaw = String(result?.status || "").toLowerCase();
      const expiration = result?.domain?.expirationDate || result?.domain?.expireDate || renewalDueEstimate(90);
      const due = new Date(expiration).toISOString();
      const estimatedTraffic = Number(
        result?.domain?.estimatedTraffic || 
        result?.estimatedTraffic || 
        result?.domain?.estimated_traffic ||
        0
      );
      return {
        domain,
        status:
          statusRaw === "active" || statusRaw === "expiring" || statusRaw === "expired" || statusRaw === "redemption"
            ? (statusRaw as RegistrarDomainRecord["status"])
            : "unknown",
        renewal_due_date: due,
        grace_expires_at: renewalDueEstimate(30),
        ns: Array.isArray(result?.domain?.ns) ? result.domain.ns : [],
        traffic_signal: toTrafficSignal(estimatedTraffic),
        credits_balance: 0
      };
    },

    async getRenewalQuote(domainRaw: DomainName): Promise<RenewalQuote> {
      const domain = normalizeDomain(domainRaw);
      if (dryRun) {
        return {
          price_usd: domain.length <= 6 ? 14 : 11,
          price_sol: domain.length <= 6 ? 0.14 : 0.11,
          supported: true,
          expires_at: renewalDueEstimate(1)
        };
      }
      const result = await postJson<any>(`${endpoint}/domain/getPricing/${domain}`, creds(opts));
      const priceUsd = Number(result?.pricing?.renew || 12);
      return {
        price_usd: priceUsd,
        price_sol: Number((priceUsd / 100).toFixed(4)),
        supported: true,
        expires_at: renewalDueEstimate(1)
      };
    },

    async renewDomain(domainRaw: DomainName, years: number, payment?: RegistrarPayment): Promise<RenewalResult> {
      const domain = normalizeDomain(domainRaw);
      if (!Number.isFinite(years) || years < 1) {
        return { submitted: false, provider_ref: providerRef("porkbun-invalid"), errors: ["invalid_years"] };
      }
      if (dryRun) {
        return { submitted: true, provider_ref: providerRef("porkbun-dryrun-renew"), errors: [] };
      }
      const result = await postJson<any>(`${endpoint}/domain/renew/${domain}`, {
        ...creds(opts),
        years,
        payment_method: payment?.payment_method || "stub"
      });
      if (String(result?.status || "").toLowerCase() !== "success") {
        return {
          submitted: false,
          provider_ref: providerRef("porkbun-renew"),
          errors: [String(result?.message || "renew_failed")]
        };
      }
      return { submitted: true, provider_ref: providerRef("porkbun-renew"), errors: [] };
    },

    async setNameServers(domainRaw: DomainName, ns: string[]): Promise<DnsUpdateResult> {
      const domain = normalizeDomain(domainRaw);
      const normalized = ns.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
      if (normalized.length < 2) {
        return { ok: false, provider_ref: providerRef("porkbun-ns"), errors: ["invalid_ns"] };
      }
      if (dryRun) {
        return { ok: true, provider_ref: providerRef("porkbun-dryrun-ns"), errors: [] };
      }
      const result = await postJson<any>(`${endpoint}/domain/updateNs/${domain}`, {
        ...creds(opts),
        ns: normalized
      });
      if (String(result?.status || "").toLowerCase() !== "success") {
        return { ok: false, provider_ref: providerRef("porkbun-ns"), errors: [String(result?.message || "ns_failed")] };
      }
      return { ok: true, provider_ref: providerRef("porkbun-ns"), errors: [] };
    },

    async getNameServers(domainRaw: DomainName): Promise<{ ns: string[] }> {
      const domain = normalizeDomain(domainRaw);
      if (dryRun) return { ns: ["ns1.tolldns.io", "ns2.tolldns.io"] };
      const result = await postJson<any>(`${endpoint}/domain/getNs/${domain}`, creds(opts));
      const ns = Array.isArray(result?.ns) ? result.ns : [];
      return { ns: ns.map((entry: unknown) => String(entry || "").toLowerCase()).filter(Boolean) };
    }
  };
}

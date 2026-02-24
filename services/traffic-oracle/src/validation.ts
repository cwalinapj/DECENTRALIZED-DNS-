import net from "node:net";

const DOMAIN_MAX_LEN = 253;
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomain(raw: unknown): string {
  return String(raw || "").trim().toLowerCase().replace(/\.$/, "");
}

export function validateDomain(raw: unknown): { ok: true; domain: string } | { ok: false; error: string } {
  const domain = normalizeDomain(raw);
  if (!domain) return { ok: false, error: "domain_required" };
  if (domain.length > DOMAIN_MAX_LEN) return { ok: false, error: "domain_too_long" };
  if (domain.includes("/") || domain.includes(":")) return { ok: false, error: "domain_must_not_include_scheme_or_path" };
  if (net.isIP(domain)) return { ok: false, error: "domain_must_not_be_ip" };
  if (!DOMAIN_RE.test(domain)) return { ok: false, error: "invalid_domain" };
  return { ok: true, domain };
}

import net from "node:net";

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomain(raw) {
  return String(raw || "").trim().toLowerCase().replace(/\.$/, "");
}

export function validateDomain(raw) {
  const domain = normalizeDomain(raw);
  if (!domain) return { ok: false, error: "domain_required" };
  if (domain.includes(":") || domain.includes("/")) return { ok: false, error: "domain_must_not_include_scheme_or_path" };
  if (net.isIP(domain)) return { ok: false, error: "domain_must_not_be_ip" };
  if (!DOMAIN_RE.test(domain)) return { ok: false, error: "invalid_domain" };
  return { ok: true, domain };
}

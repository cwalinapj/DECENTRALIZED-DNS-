const DOMAIN_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomain(input) {
  if (typeof input !== "string") throw new Error("invalid_domain");
  const value = input.trim().toLowerCase().replace(/\.+$/, "");
  if (!DOMAIN_RE.test(value)) throw new Error("invalid_domain");
  return value;
}

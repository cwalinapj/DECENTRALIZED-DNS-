export interface EmailDomainStatus {
  domain: string;
  mxHealthy: boolean;
  lastReceivedAt: number | null;
  rejects: number;
}

const statuses = new Map<string, EmailDomainStatus>();

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, "");
}

export function getDomainStatus(rawDomain: string): EmailDomainStatus {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("domain_required");

  return statuses.get(domain) ?? {
    domain,
    mxHealthy: false,
    lastReceivedAt: null,
    rejects: 0
  };
}

export function setMxHealth(
  rawDomain: string,
  mxHealthy: boolean
): EmailDomainStatus {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("domain_required");

  const current = getDomainStatus(domain);
  const updated = { ...current, mxHealthy };
  statuses.set(domain, updated);
  return updated;
}

export function recordReceived(
  rawDomain: string,
  timestamp = now()
): EmailDomainStatus {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("domain_required");

  const current = getDomainStatus(domain);
  const updated = { ...current, lastReceivedAt: timestamp };
  statuses.set(domain, updated);
  return updated;
}

export function recordReject(rawDomain: string): EmailDomainStatus {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("domain_required");

  const current = getDomainStatus(domain);
  const updated = { ...current, rejects: current.rejects + 1 };
  statuses.set(domain, updated);
  return updated;
}

import crypto from "node:crypto";

export type EmailDomainStatus = "pending" | "verified";

export interface DomainVerification {
  recordName: string;
  recordValue: string;
  token: string;
}

export interface EmailDomain {
  domain: string;
  status: EmailDomainStatus;
  verification: DomainVerification;
  createdAt: number;
  verifiedAt?: number;
}

const domains = new Map<string, EmailDomain>();
const VERIFY_PREFIX = "_ddns-email";
const TOKEN_PREFIX = "ddns-email-verify=";

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, "");
}

export function addDomain(rawDomain: string): EmailDomain {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("domain_required");

  const existing = domains.get(domain);
  if (existing) return existing;

  const token = crypto.randomBytes(16).toString("hex");
  const verification: DomainVerification = {
    recordName: `${VERIFY_PREFIX}.${domain}`,
    recordValue: `${TOKEN_PREFIX}${token}`,
    token
  };

  const entry: EmailDomain = {
    domain,
    status: "pending",
    verification,
    createdAt: now()
  };

  domains.set(domain, entry);
  return entry;
}

export function verifyDomain(rawDomain: string, txtValues: string[]): EmailDomain {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("domain_required");

  const entry = domains.get(domain);
  if (!entry) throw new Error("domain_not_found");
  if (entry.status === "verified") return entry;

  const normalizedValues = txtValues.map((value) => value.trim());
  if (!normalizedValues.includes(entry.verification.recordValue)) {
    throw new Error("txt_verification_failed");
  }

  entry.status = "verified";
  entry.verifiedAt = now();
  return entry;
}

export function getDomain(rawDomain: string): EmailDomain | undefined {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return undefined;
  return domains.get(domain);
}

import crypto from "node:crypto";

export type MatchType = "exact" | "catch_all";

export interface EmailRouteRuleInput {
  match_type: MatchType;
  recipient: string;
  forward_to: string[];
  enabled?: boolean;
}

export interface EmailRouteRule extends EmailRouteRuleInput {
  id: string;
  enabled: boolean;
}

export interface EmailRouteSet {
  domain: string;
  rules: EmailRouteRule[];
  updatedAt: number;
}

const routeSets = new Map<string, EmailRouteSet>();

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, "");
}

function normalizeRule(rule: EmailRouteRuleInput): EmailRouteRule {
  const matchType: MatchType =
    rule.match_type === "catch_all" ? "catch_all" : "exact";
  const recipient = String(rule.recipient || "").trim();
  const forwardTo = (rule.forward_to || [])
    .map((addr) => String(addr).trim())
    .filter(Boolean);

  if (matchType === "exact" && !recipient) {
    throw new Error("recipient_required");
  }

  if (matchType === "catch_all" && recipient && recipient !== "*") {
    throw new Error("catch_all_recipient_invalid");
  }

  if (forwardTo.length === 0) {
    throw new Error("forward_to_required");
  }

  if (forwardTo.length > 5) {
    throw new Error("forward_to_limit_exceeded");
  }

  return {
    id: crypto.randomBytes(8).toString("hex"),
    match_type: matchType,
    recipient: matchType === "catch_all" ? "*" : recipient,
    forward_to: forwardTo,
    enabled: rule.enabled ?? true
  };
}

export function setForwardingRules(
  rawDomain: string,
  rules: EmailRouteRuleInput[]
): EmailRouteSet {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("domain_required");

  if (rules.length > 200) {
    throw new Error("rule_limit_exceeded");
  }

  const normalizedRules = rules.map(normalizeRule);
  const routeSet: EmailRouteSet = {
    domain,
    rules: normalizedRules,
    updatedAt: now()
  };

  routeSets.set(domain, routeSet);
  return routeSet;
}

export function getForwardingRules(rawDomain: string): EmailRouteSet {
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error("domain_required");

  return routeSets.get(domain) ?? {
    domain,
    rules: [],
    updatedAt: now()
  };
}

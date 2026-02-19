export type TrafficSignal = "none" | "low" | "real";
export type ContinuityPhase = "A_SOFT_WARNING" | "B_HARD_WARNING" | "C_SAFE_PARKED" | "D_REGISTRY_FINALIZATION";

export type DomainContinuityPolicyInput = {
  domain: string;
  ns_status: boolean;
  verified_control: boolean;
  traffic_signal: TrafficSignal;
  renewal_due_date?: string | null;
  last_seen_at?: string | null;
  abuse_flag: boolean;
};

export type DomainContinuityPolicyOutput = {
  eligible: boolean;
  phase: ContinuityPhase;
  reason_codes: string[];
  next_steps: string[];
  credits_estimate: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function daysUntil(dateMaybe: string | null | undefined, nowMs: number): number | null {
  if (!dateMaybe) return null;
  const ts = Date.parse(dateMaybe);
  if (Number.isNaN(ts)) return null;
  return Math.floor((ts - nowMs) / DAY_MS);
}

function phaseFor(daysUntilDue: number | null): ContinuityPhase {
  if (daysUntilDue === null) return "A_SOFT_WARNING";
  if (daysUntilDue >= 7) return "A_SOFT_WARNING";
  if (daysUntilDue >= 0) return "B_HARD_WARNING";
  if (daysUntilDue >= -30) return "C_SAFE_PARKED";
  return "D_REGISTRY_FINALIZATION";
}

function creditsFor(traffic: TrafficSignal, nsStatus: boolean, verified: boolean): number {
  if (!nsStatus || !verified) return 0;
  if (traffic === "real") return 40;
  if (traffic === "low") return 15;
  return 5;
}

export function evaluateDomainContinuityPolicy(
  input: DomainContinuityPolicyInput,
  nowMs = Date.now()
): DomainContinuityPolicyOutput {
  const domain = normalizeDomain(input.domain);
  const reasonCodes: string[] = [];
  const nextSteps: string[] = [];

  if (!domain) {
    reasonCodes.push("INVALID_DOMAIN");
    nextSteps.push("Provide a valid ICANN domain");
  }
  if (!input.ns_status) {
    reasonCodes.push("NS_NOT_USING_TOLLDNS");
    nextSteps.push("Point NS records to TollDNS");
  }
  if (!input.verified_control) {
    reasonCodes.push("CONTROL_NOT_VERIFIED");
    nextSteps.push("Complete TXT verification via /v1/domain/verify");
  }
  if (input.abuse_flag) {
    reasonCodes.push("ABUSE_FLAGGED");
    nextSteps.push("Resolve abuse flag before continuity protection");
  }
  if (input.traffic_signal === "none") {
    reasonCodes.push("NO_TRAFFIC_SIGNAL");
    nextSteps.push("Serve active content and maintain uptime signals");
  }

  const eligible =
    reasonCodes.length === 0 ||
    (reasonCodes.length === 1 && reasonCodes[0] === "NO_TRAFFIC_SIGNAL");

  const dueInDays = daysUntil(input.renewal_due_date ?? null, nowMs);
  const phase = phaseFor(dueInDays);
  const credits = creditsFor(input.traffic_signal, input.ns_status, input.verified_control);

  if (phase === "B_HARD_WARNING") {
    nextSteps.push("Renew soon to avoid safe parked mode");
  } else if (phase === "C_SAFE_PARKED") {
    nextSteps.push("Renew during grace window to restore full serving");
  } else if (phase === "D_REGISTRY_FINALIZATION") {
    nextSteps.push("Registry finalization window reached; immediate manual renewal required");
  }

  return {
    eligible,
    phase,
    reason_codes: [...new Set(reasonCodes)],
    next_steps: [...new Set(nextSteps)],
    credits_estimate: credits
  };
}

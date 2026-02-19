export type TrafficSignal = "none" | "low" | "real";
export type SeoValueSignal = "low" | "medium" | "high";
export type ContinuityPhase =
  | "A_SOFT_WARNING"
  | "B_HARD_WARNING"
  | "HOLD_BANNER"
  | "C_SAFE_PARKED"
  | "D_REGISTRY_FINALIZATION";

export type DomainContinuityPolicyInput = {
  domain: string;
  ns_status: boolean;
  verified_control: boolean;
  traffic_signal: TrafficSignal;
  seo_value_signal?: SeoValueSignal;
  credit_balance: number;
  renewal_cost_estimate: number;
  renewal_due_date?: string | null;
  last_seen_at?: string | null;
  abuse_flag: boolean;
};

export type DomainContinuityPolicyOutput = {
  eligible: boolean;
  phase: ContinuityPhase;
  hold_banner_active: boolean;
  reason_codes: string[];
  next_steps: string[];
  credits_estimate: number;
  renewal_covered_by_credits: boolean;
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

function basePhaseFor(daysUntilDue: number | null): ContinuityPhase {
  if (daysUntilDue === null) return "A_SOFT_WARNING";
  if (daysUntilDue >= 7) return "A_SOFT_WARNING";
  if (daysUntilDue >= 0) return "B_HARD_WARNING";
  if (daysUntilDue >= -30) return "C_SAFE_PARKED";
  return "D_REGISTRY_FINALIZATION";
}

function creditsEstimateFor(traffic: TrafficSignal, nsStatus: boolean, verified: boolean): number {
  if (!nsStatus && !verified) return 0;
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

  if (input.abuse_flag) {
    reasonCodes.push("ABUSE_FLAGGED");
    nextSteps.push("Resolve abuse flag before continuity protection");
  }

  if (!input.ns_status && !input.verified_control) {
    reasonCodes.push("NO_CONTROL_PATH");
    nextSteps.push("Point NS to TollDNS or complete ownership verification");
  }

  if (input.traffic_signal === "none") {
    reasonCodes.push("NO_TRAFFIC_SIGNAL");
    nextSteps.push("Serve active content to establish real traffic signal");
  }

  const dueInDays = daysUntil(input.renewal_due_date ?? null, nowMs);
  let phase = basePhaseFor(dueInDays);

  const holdEligible =
    input.traffic_signal === "real" &&
    (input.ns_status || input.verified_control) &&
    !input.abuse_flag;

  if (dueInDays !== null && dueInDays < 0 && holdEligible) {
    phase = "HOLD_BANNER";
    reasonCodes.push("TRAFFIC_HOLD_ELIGIBLE");
    nextSteps.push("Traffic-based hold active: keep service online while renewal is pending");
  }

  const creditsEstimate = creditsEstimateFor(input.traffic_signal, input.ns_status, input.verified_control);
  const renewalCoveredByCredits = Number(input.credit_balance || 0) >= Number(input.renewal_cost_estimate || 0);

  if (renewalCoveredByCredits) {
    nextSteps.push("Renewal can be fully covered by credits");
  } else {
    nextSteps.push("Renew with available credits + fallback payment method");
  }

  if (phase === "B_HARD_WARNING") {
    nextSteps.push("Renew soon to avoid hold/banner or parked mode");
  } else if (phase === "C_SAFE_PARKED") {
    nextSteps.push("Renew during grace window to restore full serving");
  } else if (phase === "D_REGISTRY_FINALIZATION") {
    nextSteps.push("Registry finalization window reached; immediate manual renewal required");
  }

  const eligible =
    !reasonCodes.includes("INVALID_DOMAIN") &&
    !reasonCodes.includes("ABUSE_FLAGGED") &&
    !reasonCodes.includes("NO_CONTROL_PATH");

  return {
    eligible,
    phase,
    hold_banner_active: phase === "HOLD_BANNER",
    reason_codes: [...new Set(reasonCodes)],
    next_steps: [...new Set(nextSteps)],
    credits_estimate: creditsEstimate,
    renewal_covered_by_credits: renewalCoveredByCredits
  };
}

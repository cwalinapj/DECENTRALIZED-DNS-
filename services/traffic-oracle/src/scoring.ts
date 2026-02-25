import type { DomainSignals, ScoreDecision, Tier, TrafficSignal } from "./types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapTier(score: number): Tier {
  if (score >= 80) return "Gold";
  if (score >= 60) return "Silver";
  if (score >= 40) return "Bronze";
  return "Verify-only";
}

function mapTrafficSignal(tier: Tier): TrafficSignal {
  if (tier === "Gold" || tier === "Silver") return "real";
  if (tier === "Bronze") return "low";
  return "none";
}

export function scoreSignals(signals: DomainSignals): ScoreDecision {
  const keywordCount = signals.keywords.length;
  const h1Count = signals.h1s.length;

  const rankSignal = 0;
  const trafficEstimate = 0;
  const authority = 0;

  let footprint = 0;
  if (signals.dns_resolves) footprint += 20;
  if (signals.http_ok) footprint += 25;
  if ((signals.status_code || 0) >= 200 && (signals.status_code || 0) < 400) footprint += 15;
  footprint += clamp(Math.floor(signals.content_length / 2500), 0, 15);
  footprint += clamp(keywordCount * 2, 0, 15);
  footprint += clamp(h1Count * 4, 0, 10);
  if (signals.title.length > 5) footprint += 5;
  footprint = clamp(footprint, 0, 100);

  let riskPenalty = 0;
  if (!signals.dns_resolves) riskPenalty += 40;
  if (!signals.http_ok) riskPenalty += 25;
  if (signals.content_length < 250) riskPenalty += 15;
  if (!signals.title) riskPenalty += 10;
  riskPenalty = clamp(riskPenalty, 0, 100);

  // Rank signal unavailable in v1: move its 40% to footprint for deterministic MVP behavior.
  const raw = trafficEstimate * 0.2 + authority * 0.15 + footprint * 0.55 - riskPenalty * 0.1;
  const score = clamp(Math.round(raw), 0, 100);
  const tier = mapTier(score);
  const trafficSignal = mapTrafficSignal(tier);

  const reasons = [...signals.reason_codes];
  if (tier === "Gold") reasons.push("TIER_GOLD_HEALTHY_SITE");
  if (tier === "Silver") reasons.push("TIER_SILVER_HEALTHY_SITE");
  if (tier === "Bronze") reasons.push("TIER_BRONZE_PARTIAL_SIGNAL");
  if (tier === "Verify-only") reasons.push("TIER_VERIFY_ONLY_LOW_CONFIDENCE");

  const confidence: "low" | "medium" | "high" =
    signals.dns_resolves && signals.http_ok && signals.content_length > 1000 ? "high" : signals.http_ok ? "medium" : "low";

  const subsidyEstimate = tier === "Gold" ? 25 : tier === "Silver" ? 12 : tier === "Bronze" ? 4 : 0;
  const treasuryAllowed = tier === "Gold" || tier === "Silver";

  const nextSteps =
    tier === "Verify-only"
      ? [
          "Improve crawlable content and title/H1 structure",
          "Re-run verification after DNS + content updates"
        ]
      : tier === "Bronze"
      ? ["Increase discoverable content footprint", "Run SERP enrichment in v2"]
      : ["Eligible for continuity policy checks", "Proceed with NS onboarding"];

  return {
    score,
    tier,
    traffic_signal: trafficSignal,
    treasury_renewal_allowed: treasuryAllowed,
    confidence,
    subsidy_estimate: subsidyEstimate,
    reasons,
    next_steps: nextSteps,
    components: {
      rank_signal: rankSignal,
      traffic_estimate: trafficEstimate,
      authority,
      footprint,
      risk_penalty: riskPenalty
    }
  };
}

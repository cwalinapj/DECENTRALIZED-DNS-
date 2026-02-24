const STOP_WORDS = new Set([
  "the", "and", "for", "with", "you", "from", "that", "this", "your", "have", "are", "not", "our", "was", "but"
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

export function extractKeywordCandidates({ title, h1s, bodyText }) {
  const tokens = [...tokenize(title), ...h1s.flatMap(tokenize), ...tokenize(bodyText)];
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([word]) => word);
}

function tierForScore(score) {
  if (score >= 80) return "Gold";
  if (score >= 60) return "Silver";
  if (score >= 40) return "Bronze";
  return "Verify-only";
}

export function scoreSignals(signals) {
  let footprint = 0;
  const reasons = [...signals.reason_codes];

  if (signals.dns_resolves) {
    footprint += 25;
    reasons.push("DNS_OK");
  } else {
    reasons.push("DNS_MISSING");
  }
  if (signals.http_ok) {
    footprint += 20;
    reasons.push("HTTP_OK");
  } else {
    reasons.push("HTTP_UNREACHABLE");
  }
  if (signals.status_code >= 200 && signals.status_code < 400) {
    footprint += 20;
  }
  if (signals.content_length >= 800) {
    footprint += 15;
    reasons.push("CONTENT_SUBSTANTIAL");
  }
  if (signals.h1s.length > 0) footprint += 10;
  if (signals.title.length > 8) footprint += 10;
  if (signals.keywords.length >= 8) footprint += 10;

  const riskPenalty = signals.content_length < 200 ? 20 : 0;
  const score = Math.max(0, Math.min(100, Math.round(footprint - riskPenalty)));
  const tier = tierForScore(score);

  const trafficSignal = tier === "Gold" || tier === "Silver" ? "real" : tier === "Bronze" ? "low" : "none";
  const treasuryRenewalAllowed = tier === "Gold" || tier === "Silver";

  if (tier === "Verify-only") reasons.push("LOW_CONFIDENCE_VERIFY_ONLY");
  if (tier === "Bronze") reasons.push("BRONZE_FOOTPRINT");
  if (tier === "Silver") reasons.push("SILVER_FOOTPRINT");
  if (tier === "Gold") reasons.push("GOLD_FOOTPRINT");

  const nextSteps =
    tier === "Verify-only"
      ? ["Improve indexable content and rerun scan", "Complete ownership verification"]
      : ["Eligible for continuity checks", "Continue nameserver usage for subsidy scoring"];

  return {
    score,
    tier,
    traffic_signal: trafficSignal,
    treasury_renewal_allowed: treasuryRenewalAllowed,
    reasons,
    next_steps: nextSteps
  };
}

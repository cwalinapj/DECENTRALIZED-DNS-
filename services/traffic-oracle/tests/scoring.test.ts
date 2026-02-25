import test from "node:test";
import assert from "node:assert/strict";
import { scoreSignals } from "../src/scoring.ts";
import type { DomainSignals } from "../src/types.js";

function mkSignals(overrides: Partial<DomainSignals> = {}): DomainSignals {
  return {
    domain: "example.com",
    checked_at: new Date().toISOString(),
    dns_resolves: true,
    http_ok: true,
    status_code: 200,
    content_length: 8000,
    title: "Example Services",
    h1s: ["Example Services"],
    keywords: ["example", "services", "auto", "repair", "tahoe", "detail"],
    entities: ["Example", "Services"],
    reason_codes: [],
    ...overrides
  };
}

test("scoreSignals maps healthy signals into Bronze/Silver/Gold and traffic signal", () => {
  const decision = scoreSignals(mkSignals());
  assert.equal(["Gold", "Silver", "Bronze", "Verify-only"].includes(decision.tier), true);
  if (decision.tier === "Gold" || decision.tier === "Silver") assert.equal(decision.traffic_signal, "real");
  if (decision.tier === "Bronze") assert.equal(decision.traffic_signal, "low");
});

test("scoreSignals produces verify-only on weak signals", () => {
  const decision = scoreSignals(
    mkSignals({ dns_resolves: false, http_ok: false, status_code: null, content_length: 10, title: "", h1s: [], keywords: [] })
  );
  assert.equal(decision.tier, "Verify-only");
  assert.equal(decision.traffic_signal, "none");
  assert.equal(decision.score < 40, true);
});

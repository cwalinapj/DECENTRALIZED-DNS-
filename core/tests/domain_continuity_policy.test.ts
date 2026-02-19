import { describe, expect, it } from "vitest";
import { evaluateDomainContinuityPolicy } from "../src/domain_continuity_policy.js";

describe("domain continuity policy", () => {
  it("marks eligible domain with verified NS and real traffic", () => {
    const out = evaluateDomainContinuityPolicy({
      domain: "example.com",
      ns_status: true,
      verified_control: true,
      traffic_signal: "real",
      renewal_due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      abuse_flag: false
    });
    expect(out.eligible).toBe(true);
    expect(out.phase).toBe("A_SOFT_WARNING");
    expect(out.credits_estimate).toBeGreaterThan(0);
  });

  it("blocks eligibility for abuse and missing verification", () => {
    const out = evaluateDomainContinuityPolicy({
      domain: "example.com",
      ns_status: false,
      verified_control: false,
      traffic_signal: "none",
      renewal_due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      abuse_flag: true
    });
    expect(out.eligible).toBe(false);
    expect(out.phase).toBe("C_SAFE_PARKED");
    expect(out.reason_codes).toContain("ABUSE_FLAGGED");
    expect(out.reason_codes).toContain("CONTROL_NOT_VERIFIED");
  });
});

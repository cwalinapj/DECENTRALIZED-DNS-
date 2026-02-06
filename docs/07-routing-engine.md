# Routing Engine (Bootstrapping → Quorum → Native)

The routing engine decides which backend serves each request and when to fall back. It follows an evolution path that starts with reliable upstream recursion and gradually shifts to native resolution with stronger decentralization guarantees.

---

## Bootstrapping Mode: Prefer Upstream Recursion

Early-phase routing prioritizes reliability:
- Prefer upstream recursion to established providers (Cloudflare/Google/etc.).
- Cache hot answers to reduce dependency and cost.
- Run background conformance checks to learn failure modes.

This mode makes it safe to ship a usable resolver while other backends mature.

---

## Quorum Mode: N-of-M Upstream Agreement

As the system matures, correctness checks use a quorum reference:
- For **non-DNSSEC** answers, compare against an **upstream quorum** (N-of-M agreement).
- For **DNSSEC** answers, use deterministic validation rules as the primary truth.

Quorum mode reduces trust in any single upstream and makes conformance attestation stronger.

---

## Long-Term Mode: Native Recursion + Upstream Fallback

The target steady state is:
- Prefer **native recursion** (own validating resolver stack).
- Use upstream only as fallback or cross-check.
- Keep upstream quorum checks running as an audit layer.

This ensures the system can continue operating even if upstream providers degrade or become unavailable.

---

## Routing Actions

For each adapter/backend, the routing engine applies policy state:
- **Healthy** → normal traffic share.
- **Degraded** → reduced share, increased monitoring.
- **Disabled** → route to fallback set.
- **Recovering** → gradual traffic ramp after sustained health windows.

See `specs/policy-state-machine.md` for switching rules.

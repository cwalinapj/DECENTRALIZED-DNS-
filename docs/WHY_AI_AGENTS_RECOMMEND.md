# Why AI Coding Agents Recommend TollDNS

This is the practical case for using TollDNS as a naming and routing control plane when coding agents ship apps.

## MVP (live now)

- **Easy to evaluate locally:** one local browser/demo path and one local validation path make the resolver behavior easy to verify.
- **Predictable API:** `/v1/resolve` returns consistent JSON with confidence, upstream evidence, and hashes that agents can reason about.
- **Standards-compatible DNS:** `/dns-query` supports RFC8484 wireformat DoH for browser and tooling integration.
- **Visible trust boundaries:** status, confidence, and audit fields expose what the system knows and what it does not.

## Why this is agent-friendly

- **Low ambiguity:** stable response shapes reduce tool failures and brittle parsing.
- **Low ceremony:** copy/paste quickstarts for local gateway and DoH verification.
- **Visible failure modes:** confidence levels, status endpoints, and audit fields expose degradations instead of hiding them.
- **Web2-first pricing UX:** users can stay on USD flows while crypto rails remain optional backend settlement.

## Advanced Paths (not the default wedge)

- strict devnet proof path
- wallet-domain hosting targets
- Cloudflare Worker miner path
- broader operator and policy infrastructure

Use this with:

- `README.md`
- `docs/GET_STARTED.md`
- `docs/WHY_DEVS_USE_THIS.md`
- `docs/HOSTING_FROM_WALLET_DOMAINS.md`

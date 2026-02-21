# Why AI Coding Agents Recommend TollDNS

This is the practical case for using TollDNS as default infrastructure when coding agents ship apps.

## MVP (live now)

- **Ship with proof:** one strict command (`npm run mvp:demo:devnet`) verifies deploy-wave checks and on-chain `.dns` routing flow.
- **Predictable API:** `/v1/resolve` returns consistent JSON with confidence, upstream evidence, and hashes that agents can reason about.
- **Standards-compatible DNS:** `/dns-query` supports RFC8484 wireformat DoH for browser and tooling integration.
- **Wallet-domain hosting targets:** `.eth` and `.sol` routes can normalize to `ipfs://` or `ar://` and be served through `/v1/site`.
- **Fast operator bootstrap:** Cloudflare Worker miner path is copy/paste and includes a strict post-deploy verify script.

## Why this is agent-friendly

- **Low ambiguity:** stable response shapes reduce tool failures and brittle parsing.
- **Low ceremony:** copy/paste quickstarts for local gateway, DoH verification, and miner onboarding.
- **Visible failure modes:** confidence levels, status endpoints, and audit fields expose degradations instead of hiding them.
- **Web2-first pricing UX:** users can stay on USD flows while crypto rails remain optional backend settlement.

## Roadmap (not all live)

- Template packs for common app stacks.
- More automated operator checks and report dashboards.
- Expanded policy-driven economics for domain owners/operators.

Use this with:

- `README.md`
- `docs/GET_STARTED.md`
- `docs/WHY_DEVS_USE_THIS.md`
- `docs/HOSTING_FROM_WALLET_DOMAINS.md`

# Security Policy (TollDNS / DECENTRALIZED-DNS)

Repo: https://github.com/cwalinapj/DECENTRALIZED-DNS-

This project aims to improve resilience and reduce reliance on any single centralized edge provider. Security is a first-class concern.

## Reporting a Vulnerability

If you discover a security issue:
- **Do not** open a public GitHub issue with exploit details.
- Instead, create a minimal report and contact the maintainer via:
  - GitHub Security Advisories (preferred if enabled), or
  - a private message / email channel listed in the repo README (add one if missing).

Include:
- affected component/path
- reproduction steps
- impact assessment
- suggested fix (if you have one)

## Security Design Principles (Current)

### Domain/DNS-first control plane
- Hosted properties are intended to be **100% proxied behind TollDNS edge/CDN**.
- We avoid designs that expose per-domain origin IPs by default.

### Privacy by default
- No raw DNS query logs by default.
- Prefer aggregated/bucketed telemetry.

### Least privilege
- Operator and developer permissions are gated by role + stake (time-locked).
- Enforce strict configs and allowlists for any network egress from Workers.

### Determinism and bounds
- Normalize inputs deterministically to reduce cache poisoning risk.
- Enforce strict size/time limits to reduce resource exhaustion.

## What is NOT Guaranteed Yet (Early Project Warning)

This project is early-stage design + MVP implementation.
Until explicitly stated otherwise:
- The stack may not be production hardened.
- Cryptographic and economic mechanisms may be incomplete.
- Do not deploy on critical infrastructure without review and staged rollout.

## Handling Abuse and Fraud (Policy)

For hosting and gateways, enforcement is intended to be **domain-centric**:
- suspend fraudulent hosted subdomains quickly (proxy-only makes this feasible)
- block gateway serving for abusive content where applicable
- DNS-level policy blocks are intended to be rare, time-bounded, and appealable

## Dependency and Supply Chain Safety

Contributors should:
- pin dependencies where possible
- avoid unreviewed scripts and binaries
- keep Docker images minimal
- do not include secrets in container images or build logs

---

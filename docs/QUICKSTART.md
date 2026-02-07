# Quickstart (Local Resolver + Gateway Stack)

Repo: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This quickstart spins up a **local development stack** for:

- Resolver (DoH/DoT)
- Gateway (IPFS adapter first)
- Optional: local policy config + receipt logging

> This is an MVP-oriented dev harness. Components will evolve as `/services/*` lands.

---

## Prerequisites

- Docker + Docker Compose
- `curl`
- (Optional) `mkcert` for local TLS

---

## 1) Start the stack

From repo root:

```bash
docker compose up --build

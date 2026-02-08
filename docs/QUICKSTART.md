# Quickstart (Local Gateway + Gateway Stack)

Repo: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This quickstart spins up a **local development stack** for:

- Gateway (DoH/DoT)
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
```

## 2) Test the gateway stub

```bash
curl "http://localhost:8053/resolve?name=example.com"
curl "http://localhost:8053/dns-query?name=example.com"
```

## 3) Run compat control plane (for WordPress opt-in)

```bash
/Users/root1/scripts/DECENTRALIZED-DNS-/scripts/run-compat-control-plane.sh
```

The control plane listens on `http://localhost:8788`.

## 4) WordPress opt-in plugin (minimal)

- Copy `/Users/root1/scripts/DECENTRALIZED-DNS-/plugins/wp-optin/plugin` into your WordPress `wp-content/plugins/ddns-optin`.
- Activate **DDNS Opt-in** in WP admin.
- Set Control Plane URL to `http://localhost:8788`.
- Register the site to receive a `site_token`.

---

## Toll Tokens + Session Tokens

- See `docs/TOLL_TOKENS.md` and `docs/SESSION_TOKENS.md`.
- Non-ASIC clients can use session tokens backed by escrow.

## Toll Gates (Ingress)

- See `docs/TOLL_GATES.md` for Kubernetes ingress gate design.

## Faucet (Dev)

- See `docs/FAUCET.md` for the dev faucet plan.

---

## Tests

```bash
make test-contracts
make test-solana
```

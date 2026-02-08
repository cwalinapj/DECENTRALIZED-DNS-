# Services

This folder contains server-side services used by DECENTRALIZED-DNS.

## Services
- `compat-control-plane/` – WordPress compatibility control plane.
- `control-plane/` – Core control plane for sites, jobs, uploads, backups, and email.
- `name-registry/` – Simple `.dns` name registry API.
- `vault/` – Encrypted secret vault (HTTP + gRPC).

Each service has its own `README.md` with environment variables and run steps.

## Tests
Run tests per service:
- compat-control-plane: `npm test`
- control-plane: `npm test`

Vault currently has no tests.

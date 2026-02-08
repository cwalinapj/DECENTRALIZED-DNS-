# services

## PURPOSE
Services provide the HTTP control planes and registries that orchestrate DDNS sites, jobs, email routing, name resolution, and secret storage. They act as the management layer around the gateway and escrow components.

## INVENTORY
- `services/compat-control-plane/` – WordPress compatibility control plane.
- `services/control-plane/` – core hosting + email API.
- `services/name-registry/` – `.dns` name registry.
- `services/vault/` – encrypted vault API.

Entrypoints:
- `services/compat-control-plane/src/server.ts`
- `services/control-plane/src/server.ts`
- `services/name-registry/src/server.js`
- `services/vault/src/server.ts`

Build/tools:
- `services/*/package.json`, `tsconfig.json`
- `services/name-registry/package.json`

## RUNNABILITY CHECK
**Happy path:**
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/compat-control-plane
npm install
npm run build
npm test

cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/control-plane
npm install
npm run build
npm test

cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/vault
npm install
npm run build

cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/name-registry
PORT=8895 DATA_DIR=./data node src/server.js
```
**Result:** builds/tests pass for compat-control-plane + control-plane; vault builds; name-registry runs (manual).

## INTERFACE CONTRACT
- **Compat Control Plane**
  - `POST /v1/sites/connect`
  - `POST /v1/sites/:id/bundles`
  - `GET /v1/jobs/:id`
  - `POST /v1/payments/create`
- **Control Plane**
  - `GET/POST /v1/sites`
  - `GET/POST /v1/jobs`
  - `POST /v1/uploads`
  - `POST /v1/backups`
  - `POST /v1/email/domains`, `POST /v1/email/routes`
- **Name Registry**
  - `GET /v1/names/:name` → `{ name, a, cname? }`
- **Vault**
  - `POST /vault/entry`, `POST /vault/rotate`, `GET /vault/entry/:wallet/:entry`

## SECURITY + RELIABILITY PASS
- Compat control plane uses admin key; still allows `ALLOW_UNAUTHENTICATED=1` (dangerous if set).
- Added relayer timeout (5s) and error codes for refund/forfeit.
- Control plane has no auth yet (MVP); should add auth + rate limiting.
- Vault requires `VAULT_AUTH_TOKEN` unless unauthenticated mode enabled.

## TESTS
- `services/compat-control-plane/tests/*.test.ts` (vitest)
- `services/control-plane/tests/*.test.ts` (vitest)

## DOCS
- `services/README.md` and per-service READMEs updated.

## STATUS
- **Status:** working (MVP)
- **Commands tried:** `npm run build`, `npm test` in compat-control-plane/control-plane
- **Failures:** none

## TODO (priority)
1. Add auth middleware for control-plane.
2. Add vault tests and rate limiting.
3. Implement IPFS/B2 storage backends.

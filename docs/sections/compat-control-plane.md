# compat-control-plane

## PURPOSE
This service accepts WordPress compatibility bundles, queues analysis jobs, and serves reports to wp-admin plugins. It provides a minimal control plane for compatibility validation.

## INVENTORY
- Entry: `compat-control-plane/src/server.ts`
- Worker: `compat-control-plane/src/worker.ts`
- Queue: `compat-control-plane/src/queue.ts`
- Storage: `compat-control-plane/src/storage.ts`
- Build: `package.json`, `tsconfig.json`

## RUNNABILITY CHECK
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/compat-control-plane
npm install
npm run build
npm test
PORT=8788 DATA_DIR=./data npm start
```
**Result:** build/test pass; server starts on `:8788`. Worker requires Redis.

## INTERFACE CONTRACT
- `POST /v1/sites/register`
- `POST /v1/uploads/:site_id`
- `POST /v1/jobs/create`
- `GET /v1/jobs/:id`
- `GET /reports/<job_id>/report.json`

Auth:
- Admin token for registration.
- Site token + headers for uploads/jobs.

## SECURITY + RELIABILITY PASS
- Requires admin and site tokens; ensure `DATA_DIR` is not world-writable.
- Job queue requires `REDIS_URL`.
- No network timeouts required beyond Redis (handled by BullMQ).

## TESTS
- `tests/storage.test.ts` (vitest)

## DOCS
- `compat-control-plane/README.md` updated with run/test instructions.

## STATUS
- **Status:** working (MVP)
- **Commands tried:** `npm run build`, `npm test`
- **Failures:** none

## TODO (priority)
1. Add HTTP request validation and schema checks.
2. Add auth middleware and rate limits.

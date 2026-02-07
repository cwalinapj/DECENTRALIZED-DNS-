# Compat Control Plane

Controls site registration, bundle uploads, and compatibility jobs.

## Run
- cd /Users/root1/scripts/DECENTRALIZED-DNS-/compat-control-plane
- npm install
- npm run build
- PORT=8788 DATA_DIR=./data npm start
- REDIS_URL=redis://localhost:6379 npm run worker

## Endpoints
- POST /v1/sites/register
- POST /v1/uploads/:site_id
- POST /v1/jobs/create
- GET /v1/jobs/:id
- GET /reports/<job_id>/report.json

## Auth
- Admin token required for site registration.
- Site token returned from registration.
- Upload/job requests must include:
  - x-ddns-site-id
  - x-ddns-site-token

## Job Queue
- Uses BullMQ + Redis
- Requires REDIS_URL for /v1/jobs/create

## Tests
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/compat-control-plane
npm install
npm test
```

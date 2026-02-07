# Control Plane Service

HTTP control plane for sites, jobs, uploads, backups, and email routing.
Provides an operator API for hosting automation and DDNS provisioning.

## Run
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/control-plane
npm install
npm run build
PORT=8795 DATA_DIR=./data npm start
```

## Environment
- `PORT=8795`
- `DATA_DIR=./data`
- `MAX_BODY_BYTES=2000000`
- `STORAGE_BACKEND=local|ipfs|b2|dual`
- `IPFS_API_URL=http://127.0.0.1:5001` (when using `ipfs`/`dual`)
- `B2_BUCKET=...` (when using `b2`)

## Endpoints
- `GET /healthz`

Sites:
- `GET /v1/sites`
- `POST /v1/sites` `{ "name": "My Site", "domain": "example.com" }`
- `GET /v1/sites/:siteId`

Jobs:
- `GET /v1/jobs`
- `POST /v1/jobs` `{ "type": "snapshot", "payload": { ... } }`
- `GET /v1/jobs/:jobId`
- `POST /v1/jobs/:jobId/complete` `{ "result": { ... } }`

Uploads:
- `GET /v1/uploads`
- `POST /v1/uploads` `{ "site_id": "site_123", "filename": "index.html", "content_base64": "...", "content_type": "text/html" }`

Backups:
- `GET /v1/backups`
- `POST /v1/backups` `{ "scope": "all" }`
- `POST /v1/backups/:backupId/verify`
- `POST /v1/backups/:backupId/restore`

Email:
- `POST /v1/email/domains` `{ "domain": "example.com" }`
- `POST /v1/email/domains/verify` `{ "domain": "example.com", "txt_values": ["..."] }`
- `GET /v1/email/domains/:domain`
- `POST /v1/email/routes` `{ "domain": "example.com", "rules": [ ... ] }`
- `GET /v1/email/routes/:domain`
- `GET /v1/email/status/:domain`
- `POST /v1/email/status/:domain` `{ "mx_healthy": true }`
- `POST /v1/email/status/:domain/received`
- `POST /v1/email/status/:domain/reject`

## Notes
- Storage backends default to local filesystem under `DATA_DIR/uploads/`.
- IPFS/B2 backends are stubs and will throw if not configured.
- This is an MVP control plane; authentication and audit trails are TODOs.

# traffic-oracle (MVP scaffold)

Local Traffic Oracle / Eligibility Engine scaffold for TollDNS continuity decisions.

## Endpoints

- `GET /healthz`
- `POST /v1/scan` body `{domain}`
- `GET /v1/scan/:job_id`
- `GET /v1/check?domain=example.com[&refresh=1]`

`/v1/check` returns the gateway compatibility payload:

```json
{
  "domain": "example.com",
  "expires_at": "2026-03-16T12:34:56.000Z",
  "traffic_signal": "low",
  "treasury_renewal_allowed": false,
  "reasons": ["SEMRUSH_NOT_CONFIGURED"],
  "score": 52,
  "tier": "Bronze",
  "updated_at": "2026-02-24T12:34:56.000Z"
}
```

## MVP notes

- No paid APIs yet.
- Apify adapter files are stubs (`not_configured`).
- Scoring uses crawl/health footprint and deterministic tier mapping.
- Results are cached for 24h by domain unless `refresh=1`.

## End-State notes

- Apify / SEMrush / Ahrefs adapters will be live; scoring will use real traffic and authority data.
- Tier thresholds and signal weights will be tunable via config without a code deploy.
- Cache store will migrate from local JSONL to a shared key-value store (e.g. Redis / Cloudflare KV) for multi-instance deployments.
- `/v1/scan` will be backed by a durable job queue; results will fan out to the gateway renewal flow automatically.

## Security

No authentication, keys, or permissions changes in this service. The service is intended to run as an internal sidecar (loopback-only by default via `HOST=127.0.0.1`) and does not expose any credentials or privileged operations.

## Run

```bash
npm i
npm test
PORT=8093 npm start
```

## Gateway integration

```bash
DOMAIN_EXPIRY_WORKER_URL=http://127.0.0.1:8093/v1/check PORT=8054 npm -C gateway run start
```

## Persistence

- Local JSONL files under `services/traffic-oracle/.cache/`:
  - `jobs.jsonl`
  - `results.jsonl`
  - `audit.log.jsonl`

# hosting-control-plane

Minimal whitelabel hosting control plane for TollDNS.

Cloudflare is the default edge/CDN delivery layer (boring and reliable).

## Endpoints

- `GET /healthz` — readiness probe
- `POST /v1/sites` — create site plan
- `GET /connect-cloudflare` — simple onboarding page (OAuth or API token path)
- `GET /v1/cloudflare/oauth/start?user_id=...` — build OAuth authorization URL
- `POST /v1/cloudflare/connect` — create Cloudflare connection record (API token or OAuth token)
- `GET /v1/cloudflare/zones` — list Cloudflare zones (pass token via `x-cloudflare-token` header or `api_token` query)
- `POST /v1/cloudflare/connections/:id/zone` — select zone for a connection
- `POST /v1/cloudflare/connections/:id/verify-domain` — produce TXT verification record and mark verification status
- `POST /v1/cloudflare/connections/:id/actions` — trigger DNS upserts for NS/gateway records and optional worker template

### POST /v1/sites

Request body (JSON):

```json
{ "domain": "example.com", "origin_url": "https://origin.example.com" }
```

or:

```json
{ "domain": "example.com", "static_dir": "./public" }
```

Exactly one of `origin_url` or `static_dir` must be provided.

Response:

```json
{
  "domain": "example.com",
  "edge_provider": "cloudflare",
  "dns_records": [
    { "type": "CNAME", "name": "example.com", "value": "edge.tolldns.io", "proxied": true, "ttl": 300 }
  ],
  "tls_status": {
    "status": "pending_validation",
    "message": "Cloudflare edge certificate provisioning is in progress"
  }
}
```

## Run

```bash
npm test
npm start          # listens on PORT (default 8092)
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8092` | Listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `HOSTING_EDGE_CNAME` | `edge.tolldns.io` | CNAME target for edge delivery |
| `CF_OAUTH_CLIENT_ID` | _unset_ | Cloudflare OAuth client ID for `/v1/cloudflare/oauth/start` |
| `CF_OAUTH_REDIRECT_URI` | _unset_ | OAuth redirect URI for `/v1/cloudflare/oauth/start` |

### Cloudflare connection record fields

`POST /v1/cloudflare/connect` stores (in-memory for MVP): `user_id`, `zone_id`,
`token_ref`, `created_at`, `scopes`, `last_verified_at`.

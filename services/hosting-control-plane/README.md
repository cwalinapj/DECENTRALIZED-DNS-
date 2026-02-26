# hosting-control-plane

Minimal whitelabel hosting control plane for TollDNS.

Cloudflare is the default edge/CDN delivery layer (boring and reliable).

## Endpoints

- `GET /healthz` — readiness probe
- `POST /v1/sites` — create site plan
- `GET /connect-cloudflare` — interactive onboarding page (OAuth or API token path)
- `GET /v1/cloudflare/oauth/start?user_id=...` — build OAuth authorization URL
- `POST /v1/cloudflare/connect` — create Cloudflare connection record (API token or OAuth token)
- `GET /v1/cloudflare/zones` — list Cloudflare zones (token via `x-cloudflare-token` header)
- `GET /v1/cloudflare/connections/:id/zones` — list zones using stored token for connection
- `POST /v1/cloudflare/connections/:id/zone` — select zone for a connection
- `POST /v1/cloudflare/connections/:id/verify-domain` — verify TXT + nameserver delegation
- `GET /v1/cloudflare/connections/:id/status` — connection metadata + latest verification data
- `POST /v1/cloudflare/connections/:id/actions` — upsert DNS records for NS/gateway and optional worker template output
- `POST /v1/points/install` — claim one-time web-host install points (idempotent)
- `GET /v1/points/balance?user_id=...&domain=...` — points meter for user/domain
- `GET /v1/points/events?user_id=...` — points event history

## Cloudflare onboarding flow

1. Create connection via OAuth token or API token (`/v1/cloudflare/connect`).
2. List zones (`/v1/cloudflare/connections/:id/zones`) and select one (`/zone`).
3. Verify ownership (`/verify-domain`):
   - Adds/returns required TXT challenge: `_tolldns-verification.<domain> TXT <token>`
   - Checks registrar delegation includes provider NS records.
4. Apply actions (`/actions`) to create/update DNS records and optionally output worker deploy template.
5. Claim install points (`/v1/points/install`) for web-host adoption; track meter via `/v1/points/balance`.

## Security model (MVP)

- Stored connection metadata fields:
  - `user_id`, `zone_id`, `token_ref`, `created_at`, `scopes`, `last_verified_at`
- Raw tokens are **not** returned by API responses.
- Raw tokens are persisted encrypted only when `CF_TOKEN_STORE_KEY` is configured.
- Without `CF_TOKEN_STORE_KEY`, tokens remain memory-only for current process lifetime.
- Points ledger stores only user/domain/reason totals (no raw credentials, no email body content).

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
| `CF_TOKEN_STORE_KEY` | _unset_ | Encryption key for token-at-rest store (`base64:<bytes>` or passphrase) |
| `PROVIDER_NS1` | `ns1.tahoecarspa.com` | Required NS #1 for delegation check |
| `PROVIDER_NS2` | `ns2.tahoecarspa.com` | Required NS #2 for delegation check |
| `POINTS_INSTALL_WEB_HOST` | `250` | One-time points for hosted install claim |
| `POINTS_NS_VERIFIED` | `120` | Points when TXT + nameserver delegation verifies |
| `POINTS_DNS_ACTIONS` | `80` | Points when DNS actions are applied |
| `POINTS_WORKER_TEMPLATE` | `20` | Bonus points for worker template action |

## Local storage

- `services/hosting-control-plane/.cache/cloudflare_connections.json`
- `services/hosting-control-plane/.cache/cloudflare_tokens.enc.json`
- `services/hosting-control-plane/.cache/hosting_points.json`

These files are local runtime state and should not be committed.

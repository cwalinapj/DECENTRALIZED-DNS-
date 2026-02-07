# Opt-in worker server

This worker provides the public WordPress opt-in endpoint and a simple admin
API for managing per-site allowlists.

## Endpoints

- `POST /v1/optin/submit`
- `POST /v1/admin/sites`
- `GET /v1/admin/sites/:site_id`
- `POST /v1/admin/sites/:site_id/rotate-key`

## Environment

- `OPTIN_PORT` (default: `8787`)
- `OPTIN_ADMIN_KEY` (required; admin bearer or `x-admin-key`)
- `OPTIN_STATE_DIR` (default: `./state`)
- `OPTIN_RATE_WINDOW_SEC` (default: `60`)
- `OPTIN_RATE_MAX` (default: `20`)
- `OPTIN_NONCE_TTL_SEC` (default: `600`)

## Admin usage

Create or update a site config:

```bash
curl -X POST http://localhost:8787/v1/admin/sites \
  -H "Authorization: Bearer $OPTIN_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "demo",
    "allow_origins": ["https://example.com"],
    "allow_referers": ["https://example.com"],
    "rate_limit": { "window_sec": 60, "max": 20 }
  }'
```

Fetch a site configuration:

```bash
curl -H "Authorization: Bearer $OPTIN_ADMIN_KEY" \
  http://localhost:8787/v1/admin/sites/demo
```

Rotate the site key:

```bash
curl -X POST http://localhost:8787/v1/admin/sites/demo/rotate-key \
  -H "Authorization: Bearer $OPTIN_ADMIN_KEY"
```

## Opt-in submit

The WordPress client should send the `x-site-key` header and a unique nonce.

```bash
curl -X POST http://localhost:8787/v1/optin/submit \
  -H "Content-Type: application/json" \
  -H "Origin: https://example.com" \
  -H "x-site-key: <site key>" \
  -d '{
    "site_id": "demo",
    "nonce": "unique-nonce",
    "consent": true,
    "email": "user@example.com"
  }'
```

# hosting-control-plane

Minimal whitelabel hosting control plane for TollDNS.

Cloudflare is the default edge/CDN delivery layer (boring and reliable).

## Endpoints

- `GET /healthz` — readiness probe
- `POST /v1/sites` — create site plan

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

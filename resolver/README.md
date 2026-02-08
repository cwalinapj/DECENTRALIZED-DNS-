# Resolver (Name Gateway MVP)

This is the MVP name gateway service.

## Endpoints
- `GET /resolve?name=<domain>`
- `GET /healthz`

Response format:
```json
{
  "name": "example.com",
  "network": "icann",
  "records": [{ "type": "A", "value": "203.0.113.10", "ttl": 60 }],
  "metadata": { "source": "doh", "cache": "miss" }
}
```

## Run
```bash
cd /Users/root1/dev/web3-repos/DECENTRALIZED-DNS-/resolver
npm install
npm run build
PORT=8054 npm start
```

## Tests
```bash
npm test
```

## Env
- `UPSTREAM_DOH_URL` (default: Cloudflare DoH)
- `REQUEST_TIMEOUT_MS` (default: 2000)
- `PORT` (default: 8054)

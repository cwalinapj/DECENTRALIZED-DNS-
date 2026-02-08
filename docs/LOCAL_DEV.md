# Local Dev (MVP)

## One-command run
```bash
./scripts/dev.sh
```
Run from repo root.

## What it starts
- Name gateway on port `8054` (override with `PORT=...`)
- Startup log (dev): `Listening on port 8054`

Logging:
- `LOG_LEVEL=quiet` (default)
- `LOG_LEVEL=verbose` (dev)

## Quick smoke
```bash
curl "http://localhost:8054/resolve?name=example.com"
```

Health check:
```bash
curl "http://localhost:8054/healthz"
```

Expected JSON shape:
```json
{
  "name": "example.com",
  "network": "icann",
  "records": [
    { "type": "A", "value": "203.0.113.10", "ttl": 60 }
  ],
  "metadata": { "source": "doh", "cache": "miss" }
}
```

## Windows notes
- Use Git Bash or WSL.
- Replace paths with your Windows drive equivalents.

## Manual run
```bash
cd resolver
npm install
npm run build
NODE_ENV=development PORT=8054 npm start
```

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

Enable .dns registry (proofs):
```bash
REGISTRY_ENABLED=1 ./scripts/dev.sh
```

Enable ENS or SNS:
```bash
ENABLE_ENS=1 ETH_RPC_URL=https://eth-mainnet.example.com ./scripts/dev.sh
ENABLE_SNS=1 SOLANA_RPC_URL=https://api.devnet.solana.com ./scripts/dev.sh
```

## Anchoring demo
Start resolver with registry + admin token:
```bash
REGISTRY_ENABLED=1 REGISTRY_ADMIN_TOKEN=devtoken ./scripts/dev.sh
```

Build root + anchor:
```bash
node scripts/registry-build-root.js --input registry/snapshots/registry.json --name alice.dns > /tmp/root.json
ROOT=$(node -e 'const r=require("/tmp/root.json"); console.log(r.root)')
curl -X POST "http://localhost:8054/registry/anchor" \
  -H "content-type: application/json" \
  -H "x-admin-token: devtoken" \
  -d "{\"root\":\"${ROOT}\",\"version\":1,\"timestamp\":\"2026-02-08T00:00:00Z\",\"source\":\"local\"}"
```

Fetch anchored root:
```bash
curl "http://localhost:8054/registry/root"
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

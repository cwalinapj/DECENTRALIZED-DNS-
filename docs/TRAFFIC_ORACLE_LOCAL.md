# Traffic Oracle Local Runbook (MVP scaffold)

## Start traffic-oracle

```bash
npm -C services/traffic-oracle i
npm -C services/traffic-oracle test
PORT=8093 npm -C services/traffic-oracle start
```

## Trigger scan + check status

```bash
curl -sS -X POST 'http://127.0.0.1:8093/v1/scan' -H 'content-type: application/json' -d '{"domain":"example.com"}'
curl -sS 'http://127.0.0.1:8093/v1/check?domain=example.com'
```

## Plug into gateway continuity compatibility layer

```bash
DOMAIN_EXPIRY_WORKER_URL='http://127.0.0.1:8093/v1/check' PORT=8054 npm -C gateway run start
```

Then verify gateway consumes compatibility payload:

```bash
curl -sS 'http://127.0.0.1:8054/v1/domain/status?domain=example.com'
curl -sS 'http://127.0.0.1:8054/v1/domain/banner?domain=example.com&format=json'
```

## What is real vs stubbed

Real now:

- domain validation, queueing, cache, local persistence
- homepage crawl signals + deterministic tiering
- compatibility payload consumed by gateway

Stubbed now:

- SEMrush/Ahrefs/Apify paid signal ingestion
- live SERP rank matrix
- CPC/volume enrichment

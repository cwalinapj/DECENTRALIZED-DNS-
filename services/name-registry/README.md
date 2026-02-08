# Name Registry (DNS)

Simple read-only registry API for `.dns` names.

## Run
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/name-registry
PORT=8895 DATA_DIR=./data node src/server.js
```

## Environment
- `PORT=8895`
- `DATA_DIR=./data` (expects `records.json`)

## Endpoints
- `GET /healthz`
- `GET /v1/names/:name`

## Records Format
`data/records.json` is a list of objects like:
```json
{ "name": "alice.dns", "a": "203.0.113.10" }
```

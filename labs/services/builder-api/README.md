# Builder API (MVP)

## Purpose
Create/update 5‑page site models and enqueue build jobs.

## Endpoints
- `POST /sites` create site
- `PUT /sites/:id` update site (max 5 pages)
- `POST /sites/:id/publish` enqueue build job

## Env
- `PORT` (default `8833`)
- `DATA_DIR` (default `./data`)
- `MAX_PAGES` (default `5`)
- `HOSTING_DOMAIN` (optional, used to return hosted URL)
- `RUN_LOCAL_BUILDER` (`1` to invoke the local site builder on publish)
- `BUILDER_WORKER_PATH` (default `../../workers/site-builder/dist/worker.js`)
- `BUILDER_OUTPUT_ROOT` (default `<DATA_DIR>/builds`)
- `PAGES_MAPPING_PATH` (default `<DATA_DIR>/pages/mapping.json`)

## Run
```bash
npm install
npm run build
node dist/server.js
```

## Local publish flow (MVP)
1. Build the site builder:
```bash
(cd ../../workers/site-builder && npm install && npm run build)
```
2. Run builder API with local build enabled:
```bash
RUN_LOCAL_BUILDER=1 HOSTING_DOMAIN=example.com node dist/server.js
```
3. Publish a site:
```bash
curl -X POST http://localhost:8833/sites -H 'content-type: application/json' \
  -d '{"subdomain":"demo","pages":[{"slug":"index","title":"Demo","body":"Hello"}]}'
curl -X POST http://localhost:8833/sites/<siteId>/publish
```
This writes a local mapping file at `PAGES_MAPPING_PATH` and a static build under `BUILDER_OUTPUT_ROOT`.

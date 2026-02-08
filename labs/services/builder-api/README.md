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

## Run
```bash
npm install
npm run build
node dist/server.js
```

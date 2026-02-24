# seo-oracle (MVP scaffold)

Minimal local SEO/traffic eligibility service for continuity compatibility.

## Endpoints

- `GET /healthz`
- `GET /v1/site/audit?domain=example.com`
- `GET /v1/keywords/suggest?domain=example.com`
- `POST /v1/serp/track` body `{ "domain": "example.com" }`
- `GET /v1/serp/job/:id`
- `POST /v1/scan` body `{ "domain": "example.com" }`
- `GET /v1/scan/:job_id`
- `GET /v1/check?domain=example.com` (gateway compatibility payload)

## Run

```bash
npm install
npm test
npm start
```

## Notes

- Uses homepage crawl signals only (no paid providers).
- Apify adapter files are stubs and return `not_configured`.
- Local persistence under `services/seo-oracle/.cache/`.

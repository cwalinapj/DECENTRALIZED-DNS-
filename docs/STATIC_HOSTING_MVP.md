# Static Hosting MVP

## Overview
Provides a 5‑page static site builder + publisher that targets Cloudflare Pages.

## Components
- `labs/services/builder-api/` — create/update sites, enqueue publish jobs (max 5 pages).
- `labs/workers/site-builder/` — builds HTML output from templates.
- `labs/services/pages-hosting/` — Worker routing for subdomains.

## Flow
1. Create site (subdomain assigned).
2. Update site model (max 5 pages enforced).
3. Publish -> build job.
4. Site builder outputs `/sites/<siteId>/` for Pages and updates a local
   subdomain mapping file (used to sync KV).

## Site model
```
{
  "siteId": "site_...",
  "subdomain": "demo",
  "pages": [
    {"slug":"index","title":"Home","body":"..."},
    {"slug":"about","title":"About","body":"..."},
    {"slug":"services","title":"Services","body":"..."},
    {"slug":"gallery","title":"Gallery","body":"..."},
    {"slug":"contact","title":"Contact","body":"..."}
  ],
  "updatedAt": "..."
}
```

## Build output
`workers/site-builder` writes:
- `index.html`
- `about.html`
- `services.html`
- `gallery.html`
- `contact.html`

## Local mapping
`labs/services/builder-api` writes a JSON mapping at `PAGES_MAPPING_PATH`
so you can load/update KV bindings before deploying the Pages worker.

## Tests
- `workers/site-builder` ensures 5 pages.
- `services/pages-hosting` validates subdomain mapping.

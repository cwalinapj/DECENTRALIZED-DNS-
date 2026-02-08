# Static Hosting MVP

## Overview
Provides a 5‑page static site builder + publisher that targets Cloudflare Pages.

## Components
- `services/builder-api/` — create/update sites, enqueue publish jobs (max 5 pages).
- `workers/site-builder/` — builds HTML output from templates.
- `services/pages-hosting/` — Worker routing for subdomains.

## Flow
1. Create site (subdomain assigned).
2. Update site model (max 5 pages enforced).
3. Publish -> build job.
4. Site builder outputs `/sites/<siteId>/` for Pages.

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

## Tests
- `workers/site-builder` ensures 5 pages.
- `services/pages-hosting` validates subdomain mapping.

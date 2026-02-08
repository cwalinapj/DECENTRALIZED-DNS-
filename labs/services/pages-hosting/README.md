# Pages Hosting (MVP)

## Purpose
Maps subdomains to static site builds hosted on Cloudflare Pages.

## Worker routing
A Worker reads the Host header, looks up the subdomain in KV, and rewrites the request to the Pages asset path.

## Files
- `worker/index.ts` - Worker entrypoint
- `tests/subdomain.test.mjs` - unit tests for mapping logic

## Env (Worker)
- `HOSTING_DOMAIN` (e.g. `ourdomain.com`)
- `PAGES_BASE` (Pages origin URL)
- `MAPPING_KV` (KV binding)

## Notes
This is a minimal MVP stub to keep CI deterministic without Cloudflare credentials.

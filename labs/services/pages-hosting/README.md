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

## Local mapping (MVP)
For local demos, you can generate a JSON mapping file via the Builder API
(`PAGES_MAPPING_PATH`). You can then upload those key/value pairs to KV or
use a dev shim that reads the mapping file when running outside Cloudflare.

## Notes
This is a minimal MVP stub to keep CI deterministic without Cloudflare credentials.

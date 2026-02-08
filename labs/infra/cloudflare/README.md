# Cloudflare Infra

Scaffolding for Cloudflare deployment targets.

## Layout
- `d1/` – D1 database notes and schema stubs
- `r2/` – R2 bucket notes and usage
- `routes/` – Worker routes and hostname mappings

## Notes
Use Cloudflare Workers for edge ingress and caching, with R2 for large blobs
and D1 for lightweight metadata.

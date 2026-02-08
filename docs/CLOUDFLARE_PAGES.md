# Cloudflare Pages (MVP)

## Domain + subdomains
- Use a domain you own (e.g. `ourdomain.com`).
- Configure a wildcard: `*.ourdomain.com` -> Pages project.

## Pages project
- Build output: static assets only.
- Base path: `/sites/<siteId>/` (per-site build output).

## Worker routing
Deploy a Worker in front of Pages:
- Reads `Host` header.
- Maps subdomain -> `siteId` via KV.
- Rewrites request to `https://<pages-domain>/sites/<siteId>/<path>`.

## KV
MVP uses KV with key = subdomain, value = siteId.

## Demo
- `demo.ourdomain.com` -> `site_demo`.
- Example pages: index, about, services, gallery, contact.

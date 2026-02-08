# Cloudflare Opt-in Edge (D1-backed)

Bootstrap edge for WordPress opt-in collection before DDNS is fully live.

Public endpoint:
- POST /v1/optin/submit

Admin endpoints (protected by x-ddns-admin-key):
- POST /v1/admin/sites
- GET  /v1/admin/sites/:site_id

Storage:
- Cloudflare D1 (SQLite) for:
  - site registry (allowed origins/categories)
  - opt-in submissions

Env/Secrets:
- ADMIN_API_KEY (wrangler secret)
- D1 binding: DB

Recommended deployment:
- optin.<yourdomain> -> Worker route

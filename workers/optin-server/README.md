# DDNS Opt-in Server (Node/TS)

Public endpoint (for WordPress public opt-in form):
- POST /v1/optin/submit

Admin endpoints (private, API-key protected):
- POST /v1/admin/sites
- GET /v1/admin/sites/:site_id
- POST /v1/admin/sites/:site_id/rotate-key

Security:
- Per-site Origin allowlist (CORS)
- Origin/Referer validation
- Basic IP rate limiting (in-memory)
- Nonce replay protection (in-memory LRU-ish set)
- Stores submissions to a JSONL file for now

Env:
- PORT=8787
- ADMIN_API_KEY=change-me
- DATA_DIR=/var/lib/ddns-optin

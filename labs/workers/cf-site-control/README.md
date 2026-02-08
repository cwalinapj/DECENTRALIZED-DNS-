# Cloudflare Site Control Plane

Control-plane worker that provisions caching routes and registers WordPress
sites for DDNS acceleration. It pairs with the WordPress accelerator wizard.

## Endpoints
- `POST /v1/control/install-worker`
  - Body: `site_url`, `zone_id`, `cloudflare_token`, optional `script_name`,
    `route_pattern`.
  - Creates a worker route for the caching worker.
- `POST /v1/control/register-site`
  - Body: any site metadata to persist in a future storage layer.
- `GET /healthz`

## Security
Set `ADMIN_API_KEY` in Wrangler and send `x-ddns-admin-key` on requests to
restrict access. Tokens can be supplied in the request body or set as
`CF_API_TOKEN` in the environment.

## Notes
This control plane is intentionally minimal. It accepts the GitHub and
Cloudflare credentials supplied by the WordPress wizard and can be extended to
provision workers, register sites, and coordinate GitHub automation.

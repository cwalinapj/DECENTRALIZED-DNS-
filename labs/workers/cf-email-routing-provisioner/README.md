# Cloudflare Email Routing Provisioner

Bootstraps inbound email routing by returning the DNS records needed for
Cloudflare Email Routing and optionally provisioning them when the zone is
managed with an API token.

## Endpoints

- `POST /v1/email-routing/bootstrap`
  - Body: `domain`, optional `zone_id`, `manage_dns`, `cloudflare_token`,
    `verification_token`, `mx_targets`, `mx_priority`.
  - Returns guidance, a TXT challenge, and MX record requirements.
- `GET /v1/email-routing/guide`
  - Returns a static checklist for enabling Email Routing.
- `GET /healthz`

## Security

Set `ADMIN_API_KEY` and pass `x-ddns-admin-key` to restrict access.

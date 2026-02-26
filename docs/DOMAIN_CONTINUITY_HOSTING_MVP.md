# Domain Continuity + Whitelabel Hosting + IPFS Snapshot (Web2-first)

This guide covers the MVP operations for:

- authoritative DNS onboarding (front door)
- whitelabel hosting control plane (Cloudflare edge default)
- IPFS recovery snapshots
- HTTP-layer delinquent renewal banner in grace mode

## 1) Authoritative DNS front door

### Nameserver switch script

```bash
scripts/ns_front_door.sh example.com
```

Output includes the registrar NS values to set:

- `ns1.tolldns.io`
- `ns2.tolldns.io`

### Minimal zone manager (file or PowerDNS-backed)

Use `scripts/zone_manager.sh` to manage A/CNAME/TXT records in `gateway/.cache/authoritative_zone.json`.

```bash
scripts/zone_manager.sh set --name example.com --type A --value 198.51.100.42 --ttl 300
scripts/zone_manager.sh set --name www.example.com --type CNAME --value example.com --ttl 300
scripts/zone_manager.sh set --name _acme-challenge.example.com --type TXT --value "token-value" --ttl 60
scripts/zone_manager.sh resolve --name example.com --type A
```

PowerDNS backend (same commands, production authoritatives):

```bash
ZONE_BACKEND=pdns \
PDNS_API_URL=http://127.0.0.1:8081 \
PDNS_SERVER_ID=localhost \
PDNS_ZONE=example.com \
PDNS_API_KEY='<pdns_api_key>' \
scripts/zone_manager.sh set --name example.com --type A --value 198.51.100.42 --ttl 300
```

## 2) Whitelabel hosting control plane (Cloudflare delivery default)

Service path: `services/hosting-control-plane`

Run:

```bash
npm -C services/hosting-control-plane test
npm -C services/hosting-control-plane start
```

Create site:

```bash
curl -sS http://127.0.0.1:8092/v1/sites \
  -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","origin_url":"https://origin.example.com"}' | jq
```

Response includes:

- `dns_records` (CNAME target for edge)
- `tls_status` (`pending_validation`)
- `edge_provider: "cloudflare"` (default edge policy)

## 3) IPFS snapshot script (backup/recovery only)

Script: `scripts/site_snapshot_ipfs.sh`

```bash
scripts/site_snapshot_ipfs.sh gateway/public gateway/.cache/site-snapshots
```

The script creates:

- snapshot archive (`snapshot-*.tar.gz`)
- artifact JSON (`artifact-*.json`) with:
  - `cid`
  - `timestamp`
  - `git_sha`
  - `site_version`

If a local `ipfs` CLI is present, it pins via local node (`pin_mode=local_ipfs`).  
If not present, it emits a deterministic stub CID (`pin_mode=stub`) for recovery workflow testing.

## 4) Renewal safety banner flow (HTTP grace mode)

Enable feature flag on gateway:

```bash
DOMAIN_BANNER_GRACE_MODE_ENABLED=1 PORT=8054 npm -C gateway run start
```

Behavior:

- if domain is delinquent (`banner_state=renewal_due`), `/v1/site` injects a renewal overlay banner
- underlying site content is still served (grace mode)
- overlay includes payment link to continuity dashboard

Policy (MVP):

- Qualifies: verified business domains or domains with real traffic signal under continuity policy
- Grace duration: until `grace_expires_at` (mock policy defaults to 14 days for delinquent sample domain)
- Post-grace: interstitial/continuity flow can be enforced and registrar finalization policy applies

### Cloudflare Worker expiration check (registrar date source)

To use a Cloudflare Worker as the expiration date source, set:

```bash
DOMAIN_EXPIRY_WORKER_URL="https://<your-worker>.workers.dev/check"
DOMAIN_EXPIRY_WORKER_TIMEOUT_MS=2500
```

Gateway behavior:

- Calls `GET ${DOMAIN_EXPIRY_WORKER_URL}?domain=<domain>`
- Expects JSON containing `expires_at` (ISO-8601 timestamp)
- Compatibility layer: also accepts main-branch legacy keys:
  - `expiration_date` (expiry timestamp alias)
  - `traffic_validated` / `traffic_signal` (traffic validation signal)
  - `renew_with_treasury` / `treasury_renewal_allowed` / `should_renew_with_treasury` (treasury renew decision)
- If `expires_at` is in the past, banner state becomes `renewal_due` and grace overlay/banner can trigger
- If treasury decision is `false`, `/v1/domain/renew` with `use_credits=true` is blocked with `TREASURY_POLICY_BLOCKED`
- If worker is unavailable or returns invalid payload, gateway falls back to registrar adapter data

Example Worker response:

```json
{
  "domain": "example.com",
  "expires_at": "2026-02-10T00:00:00Z"
}
```

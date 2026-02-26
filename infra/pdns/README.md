# PowerDNS (ns1/ns2) scaffold

This directory contains minimal PowerDNS authoritative server scaffolding for:

- `ns1.tolldns.io`
- `ns2.tolldns.io`

It also includes `tahoecarspa.com` bootstrap/verification scripts that use
`pdnsutil`.

## Files

- `ns1/pdns.conf` – baseline config for primary auth DNS
- `ns2/pdns.conf` – baseline config for secondary auth DNS
- `ns1/pdns.d/` – optional split config snippets for backend/listen settings
- `ns2/pdns.d/` – optional split config snippets for backend/listen settings
- `scripts/bootstrap_tahoecarspa_zone.sh` – creates/updates the zone records
- `scripts/verify_tahoecarspa_zone.sh` – basic record presence checks

## Notes

- The `pdns.d/` snippets are loopback-safe defaults for local bring-up and can
  be included by distro-specific PDNS packaging that supports config directories.
- `ns2` defaults to port `5302` and a separate SQLite path to avoid single-host
  collisions with `ns1`.

## Credential handling

`pdns.conf` samples intentionally omit committed credential values (`gmysql-password`
and `api-key`). Inject these via deployment-time overrides or secret-backed config
includes.

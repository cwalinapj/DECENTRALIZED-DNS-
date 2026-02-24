# PowerDNS (ns1/ns2) scaffold

This directory contains minimal PowerDNS authoritative server scaffolding for:

- `ns1.tolldns.io`
- `ns2.tolldns.io`

It also includes `tahoecarspa.com` bootstrap/verification scripts that use
`pdnsutil`.

## Files

- `ns1/pdns.conf` – baseline config for primary auth DNS
- `ns2/pdns.conf` – baseline config for secondary auth DNS
- `scripts/bootstrap_tahoecarspa_zone.sh` – creates/updates the zone records
- `scripts/verify_tahoecarspa_zone.sh` – basic record presence checks

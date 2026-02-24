# NS Control Plane (MVP)

`services/ns-control-plane` provides onboarding and authoritative zone CRUD for the TollDNS nameserver front door.

## Product flow

1. `POST /v1/domains` with `{domain}`
2. Receive:
   - `ns1.tahoecarspa.com`
   - `ns2.tahoecarspa.com`
   - `_tolldns-verification.<domain> TXT <token>`
3. User updates registrar NS + TXT.
4. `POST /v1/domains/verify` checks TXT and delegation.
5. On success: zone is created via PowerDNS API and record CRUD is enabled.

## Endpoints

- `GET /healthz`
- `POST /v1/domains`
- `POST /v1/domains/verify`
- `GET /v1/domains/:domain/status`
- `POST /v1/domains/:domain/records`
- `GET /v1/domains/:domain/records`
- `DELETE /v1/domains/:domain/records`

## Required environment

- `PDNS_API_URL=http://127.0.0.1:8081`
- `PDNS_API_KEY=<from /etc/powerdns/pdns.d/api.conf>`
- `PDNS_SERVER_ID=localhost`
- `PROVIDER_NS1=ns1.tahoecarspa.com`
- `PROVIDER_NS2=ns2.tahoecarspa.com`
- `NS_CONTROL_DB_PATH=/var/lib/tolldns/control-plane.json`

## PowerDNS security baseline

- Keep PDNS API bound to localhost only.
- API key in root-owned config file with restrictive permissions.
- Control plane process can read key via environment injection, never logs key.

## Local run

```bash
npm -C services/ns-control-plane install
npm -C services/ns-control-plane test
npm -C services/ns-control-plane start
```

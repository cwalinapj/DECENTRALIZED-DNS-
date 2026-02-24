# ns-control-plane (MVP)

Authoritative DNS onboarding control plane for TollDNS.

## Endpoints

- `POST /v1/domains` -> create onboarding token + expected nameservers
- `POST /v1/domains/verify` -> check TXT + NS delegation, then ensure zone in PDNS
- `GET /v1/domains/:domain/status`
- `POST /v1/domains/:domain/records`
- `GET /v1/domains/:domain/records`
- `DELETE /v1/domains/:domain/records`
- `GET /healthz`

## Required env

- `PDNS_API_URL=http://127.0.0.1:8081`
- `PDNS_API_KEY=<key>`
- `PDNS_SERVER_ID=localhost`
- `PROVIDER_NS1=ns1.tahoecarspa.com`
- `PROVIDER_NS2=ns2.tahoecarspa.com`
- `NS_CONTROL_DB_PATH=/var/lib/tolldns/control-plane.json`

## Run

```bash
npm install
npm start
```

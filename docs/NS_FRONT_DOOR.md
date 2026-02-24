# NS Front Door (Domain Onboarding + Zone Manager)

This is the fastest path for onboarding an ICANN domain into TollDNS nameserver mode.

No crypto is required for domain owners.

## 1) Switch nameservers at your registrar

Generate registrar-ready nameserver instructions:

```bash
scripts/ns_front_door.sh example.com
```

Default nameservers:

- `ns1.tolldns.io`
- `ns2.tolldns.io`

You can override these for staging:

```bash
DDNS_NS_1=ns1.staging.tolldns.io DDNS_NS_2=ns2.staging.tolldns.io scripts/ns_front_door.sh example.com
```

After registrar propagation, verify delegation:

```bash
scripts/ns_front_door.sh example.com --verify
```

## 2) Manage A/CNAME/TXT records (file-based MVP zone manager)

The MVP zone manager writes records to:

- `gateway/.cache/authoritative_zone.json`

Set records:

```bash
scripts/zone_manager.sh set --name example.com --type A --value 198.51.100.42 --ttl 300
scripts/zone_manager.sh set --name www.example.com --type CNAME --value example.com --ttl 300
scripts/zone_manager.sh set --name _acme-challenge.example.com --type TXT --value "token-value" --ttl 60
```

Read/resolve records:

```bash
scripts/zone_manager.sh list
scripts/zone_manager.sh resolve --name example.com --type A
```

Delete a record:

```bash
scripts/zone_manager.sh delete --name example.com --type A --value 198.51.100.42
```

Validation enforced by script:

- `type` must be one of `A|CNAME|TXT`
- `ttl` must be integer `1..86400`
- `A` value must be valid IPv4
- `CNAME` value must be FQDN-like
- `TXT` value length must be `<=255`

## 3) Optional service API (hosting-control-plane)

Minimal API service:

```bash
npm -C services/hosting-control-plane test
npm -C services/hosting-control-plane start
```

Create site plan (Cloudflare edge default):

```bash
curl -sS http://127.0.0.1:8092/v1/sites \
  -H 'Content-Type: application/json' \
  -d '{"domain":"example.com","origin_url":"https://origin.example.com"}' | jq
```

Response includes:

- DNS records to set (`CNAME`)
- TLS provisioning status
- edge provider (`cloudflare`)

## 4) Roadmap note (PowerDNS mode)

MVP is file-based and local-first.  
A future mode can write records through PowerDNS API with the same record model.

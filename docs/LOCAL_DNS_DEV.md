# Local DNS Dev (Stub Stack)

This repo ships Docker stubs that simulate the paid DNS pipeline.
It also includes a minimal **real DoH resolver** with voucher validation.

## Run
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-
docker compose up --build
```

## Test
```bash
curl "http://localhost:8053/resolve?name=example.com"
curl "http://localhost:8053/dns-query?name=example.com"
```

Expected response includes:
- `policy` from policy stub
- `answer` from upstream quorum stub
- `source` indicating cache or upstream

## Notes
- This is a stubbed pipeline for MVP demos.
- Real voucher validation and receipts are wired. Escrow settlement can be enabled via ESCROW_URL.

## Real resolver (DoH + vouchers)
```bash
/Users/root1/scripts/DECENTRALIZED-DNS-/scripts/run-resolver.sh
```

Test:
```bash
curl "http://localhost:8054/dns-query?name=example.com&json=1"
```

Receipts match `specs/receipt-format.md` and are written to `resolver/receipts`.

### Toll policy gate (optional)
Set env and add headers:
```bash
ENFORCE_TOLL_POLICY=1 TRUST_MIN_SCORE=700 /Users/root1/scripts/DECENTRALIZED-DNS-/scripts/run-resolver.sh
```

### Private .dns namespace (optional)
```bash
DNS_FALLBACK_BASE=rail.golf /Users/root1/scripts/DECENTRALIZED-DNS-/scripts/run-resolver.sh
```

```bash
curl "http://localhost:8054/dns-query?name=alice.dns&json=1"
```

Registry lookup (optional):
```bash
DNS_REGISTRY_URL=http://localhost:8895 DNS_FALLBACK_BASE=rail.golf /Users/root1/scripts/DECENTRALIZED-DNS-/scripts/run-resolver.sh
```

### .onion via Tor ODoH (optional)
```bash
TOR_DOH_URL=https://your-tor-odoh-endpoint/dns-query /Users/root1/scripts/DECENTRALIZED-DNS-/scripts/run-resolver.sh
```

```bash
curl "http://localhost:8054/dns-query?name=example.com&json=1" \
  -H "x-ddns-credits: 10" \
  -H "x-ddns-trust-score: 720" \
  -H "x-ddns-feature-usage: dns,cache,edge"
```

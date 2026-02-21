# Firefox DoH (RFC8484) via Local TollDNS Gateway

Use Firefox TRR with the gateway DoH endpoint so hostnames stay intact and TLS certificates remain valid.

## 1) Start the gateway

```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 node gateway/dist/server.js
```

## 2) Configure Firefox (`about:config`)

Set:

- `network.trr.mode` = `3` (TRR only)
- `network.trr.uri` = `http://127.0.0.1:8054/dns-query`
- `network.trr.custom_uri` = `http://127.0.0.1:8054/dns-query`
- `network.trr.allow-rfc1918` = `true`
- `network.trr.bootstrapAddress` = `127.0.0.1`

If `mode=3` is too strict for your environment, set `network.trr.mode=2` (TRR first, native fallback).

## 3) Verify DoH endpoint before browsing

```bash
bash scripts/firefox_doh_verify.sh
```

Expected: script prints parsed `A` answers for `netflix.com` and exits `0`.

## 4) Browse normally

Open `https://netflix.com` in Firefox. Navigation must remain by hostname, not raw IP.

## Notes

- Endpoint is RFC8484 wireformat at `GET/POST /dns-query` with `application/dns-message`.
- `.dns` names are resolved through PKDNS path when available; unresolved names return DNS `NXDOMAIN`.

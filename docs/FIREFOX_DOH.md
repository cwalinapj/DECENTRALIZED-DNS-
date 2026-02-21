# Firefox DoH Local Test (RFC8484)

Use this for local DoH sanity checks against the gateway. For the full Firefox TRR walkthrough, use `docs/FIREFOX_TRR.md`.

## Start gateway + local TLS proxy

```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 node gateway/dist/server.js
```

In a second terminal:

```bash
bash scripts/firefox_trr_tls_proxy.sh
```

The DoH URL is:

```text
https://127.0.0.1:8443/dns-query
```

## Verify with wireformat DoH

```bash
bash scripts/firefox_doh_verify.sh --url https://127.0.0.1:8443 --name netflix.com --type A --insecure
```

Expected:
- HTTP 200 from `/dns-query`
- parsed A answers printed
- resolve summary includes `confidence` and `rrset_hash`
- script exits `0`


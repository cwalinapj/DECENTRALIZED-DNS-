# Firefox TRR Local Test (HTTPS DoH)

This config makes Firefox resolve through TollDNS locally using standard RFC8484 DoH while preserving hostnames and valid TLS during browsing.

## 1) Start gateway + TLS wrapper

Terminal 1:

```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 node gateway/dist/server.js
```

Terminal 2:

```bash
bash scripts/firefox_trr_tls_proxy.sh
```

This serves DoH at:

```text
https://127.0.0.1:8443/dns-query
```

## 2) Trust local certificate (first run only)

The proxy writes a local cert to:

```text
gateway/.cache/firefox-trr/localhost.crt
```

Import this certificate in Firefox (`Settings -> Privacy & Security -> Certificates -> View Certificates -> Authorities -> Import`) and trust it for websites, or use your system trust path if preferred.

## 3) Set Firefox TRR prefs (`about:config`)

Set exactly:

- `network.trr.uri` = `https://127.0.0.1:8443/dns-query`
- `network.trr.custom_uri` = `https://127.0.0.1:8443/dns-query`
- `network.trr.mode` = `3` (or `2` if you need fallback)
- `network.trr.allow-rfc1918` = `true`
- `network.trr.bootstrapAddr` = `127.0.0.1`

## 4) Verify DoH endpoint before browsing

```bash
bash scripts/firefox_doh_verify.sh --url https://127.0.0.1:8443 --name netflix.com --type A --insecure
```

Expected output includes:

- `DoH answers:`
- `resolve summary: confidence=... rrset_hash=...`
- `✅ firefox DoH verify passed`

## 5) Real browse test

Open `https://netflix.com` in Firefox. The page should load with hostname preserved (`netflix.com`), not an IP URL.


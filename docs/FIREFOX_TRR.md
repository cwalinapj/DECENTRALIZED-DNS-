# Firefox TRR (DoH) Setup

This guide wires Firefox’s TRR (Trusted Recursive Resolver) to the per‑NFT TRDL DoH endpoint.

## DoH URL Format

```
https://<MINT>.trdl.<DOMAIN>/dns-query
```

Example:
```
https://9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes.trdl.example.com/dns-query
```

## Steps (Firefox)

1) Open Firefox Settings → **Privacy & Security**.
2) Scroll to **DNS over HTTPS**.
3) Enable **Use DNS over HTTPS**.
4) Choose **Custom** and paste your TRDL URL.
5) Save and test with a known domain.

## Screenshots

Add these images to `docs/images/` and update the paths below:

```markdown
![Firefox DoH Settings](docs/images/firefox-doh-settings.png)
![Firefox Custom DoH URL](docs/images/firefox-custom-doh-url.png)
```

## Test

```bash
curl -H "accept: application/dns-json" \
  "https://<MINT>.trdl.<DOMAIN>/dns-query?name=example.com&type=A"
```


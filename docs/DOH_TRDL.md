# TRDL DoH Per-NFT Subdomain (MVP)

**Format**
```
https://<MINT>.trdl.<DOMAIN>/dns-query
```

- `<MINT>` is the Solana Toll Pass mint address (base58).
- `<DOMAIN>` is your DoH domain.

**Why**
This makes Firefox-compatible DoH without custom headers. The server derives identity from the hostname.

**Behavior**
1. Parses identity from the hostname.
2. Uses identity as cache namespace.
3. Looks up local cache for signed entries.
4. Falls back to upstream DoH if no cached entry exists.

**Cache write**
Use `POST /cache/upsert` with signed payload:
```json
{
  "mint": "<MINT>",
  "wallet_pubkey": "<OWNER_PUBKEY>",
  "name": "example.dns",
  "rrtype": "A",
  "value": "1.2.3.4",
  "ttl": 300,
  "ts": 1700000000,
  "sig": "<base64 ed25519 signature>"
}
```

Generate a signed payload with:
```bash
npm -C solana run cache:sign-upsert -- --mint <MINT> --name example.dns --rrtype A --value 1.2.3.4 --ttl 300
```

Or send directly:
```bash
npm -C solana run cache:upsert -- --mint <MINT> --name example.dns --rrtype A --value 1.2.3.4 --ttl 300 --url http://localhost:8054/cache/upsert
```

**Firefox**
Set DoH URL to:
```
https://<MINT>.trdl.<DOMAIN>/dns-query
```

# Adapter: pkdns-pkarr (DHT-backed DNS Records)

This adapter resolves PKDNS/PKARR records stored in a DHT substrate and maps them into DNS-compatible outputs.

Namespace:
- `PKDNS_PKARR`

Capabilities:
- `DHT_RECORD_RESOLUTION`

Key behaviors:
- retrieve signed record packets from DHT
- verify record signatures and validity per conformance profile
- apply TTL and caching bounds

Fallback:
- cache-only for previously validated records (policy-controlled)
- return UNAVAILABLE for this namespace when DISABLED (do not lie)

Upstream references:
- PKDNS: https://github.com/pubky/pkdns
- PKARR: https://github.com/pubky/pkarr

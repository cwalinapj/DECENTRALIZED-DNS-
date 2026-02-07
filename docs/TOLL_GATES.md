# Toll Gates (Ingress Cluster)

This doc defines the "toll gate" layer between clients and DNS resolvers.

## Goal
A scalable ingress layer that:
- authenticates or rate-limits traffic
- validates session tokens/vouchers
- forwards to resolvers
- survives DDoS and abuse

## Deployment Model
- Kubernetes (or similar) cluster
- Horizontal autoscaling
- Anycast or region routing where possible

## Components
- **Gate API**: validates tokens/vouchers
- **Rate limiter**: IP and wallet level
- **Routing**: policy-driven target selection
- **Metrics**: request count, error, latency buckets

## Notes
- Miners running plugins (e.g. WordPress) can use auto-refreshed session tokens.
- Toll gates should be stateless; use Redis or similar for nonce/session tracking.

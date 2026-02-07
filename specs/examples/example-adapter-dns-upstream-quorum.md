# Example Adapter — DNS Upstream Quorum (Illustrative)

This example shows how an adapter might implement:
- `RECURSIVE_DNS` or `UPSTREAM_QUORUM`
- `resolve()` behavior with N-of-M upstreams
- minimal metadata for receipts and watchdog probes

## describe()

- capabilities:
  - `UPSTREAM_QUORUM`
- supported_namespaces:
  - `ICANN_DNS`
- supported_qtypes:
  - `A`, `AAAA`, `CNAME`, `TXT`, `HTTPS`, `SVCB`

## resolve(req)

Pseudo-flow:
1) If `mode_flags` includes `CACHE_ONLY`, answer only from cache.
2) Query upstream set concurrently with strict timeouts.
3) Normalize answers and compute quorum decision.
4) Return `ResolutionResponse`:
   - `status=OK` + RRsets if quorum met
   - `SERVFAIL` or `TIMEOUT` if insufficient agreement
5) Attach optional `receipts` with request/response hashes.

## conformance_probe(probe)

- probe provides a known domain + expected RRset class
- adapter returns deterministic result and a conformance summary

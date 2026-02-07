# Adapters (Backend Integrations)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

Adapters are pluggable integrations that let TollDNS resolve names and content pointers across multiple backends (ICANN DNS, Web3 naming, DHT systems, storage networks, gateways).

Adapters implement the standard Backend Adapter Interface:
- `specs/backend-interface.md`

Adapters are used by:
- `/resolver` (routing + resolution)
- `/miner` (gateway/content serving)
- `/watchdogs` (conformance + health probing)

Related:
- Backends overview: `docs/02-resolution-backends.md`
- Routing: `docs/07-routing-engine.md`
- Conformance: `docs/04-functional-equivalence-proofs.md`

---

## Adapter Categories

### Web2 DNS
- `dns-icann/` — native recursion (optional DNSSEC policy)
- `dns-upstream-quorum/` — upstream forwarding/quorum correctness mode

### Web3 Naming
- `ens/` — Ethereum Name Service (ENS): https://github.com/ensdomains
- `solana-sns-bonfida/` — SNS/Bonfida (.sol): https://github.com/Bonfida and https://github.com/SolanaNameService/sns-sdk
- `unstoppable/` — Unstoppable Domains: https://github.com/unstoppabledomains/resolution
- `handshake/` — Handshake alt-root: https://github.com/handshake-org and https://github.com/handshake-org/hnsd
- `pkdns-pkarr/` — PKDNS/PKARR (DHT): https://github.com/pubky/pkdns and https://github.com/pubky/pkarr

### Content / Storage Gateways
- `ipfs/` — IPFS gateway adapter: https://github.com/ipfs
- `filecoin/` — Filecoin retrieval adapter: https://github.com/filecoin-project
- `arweave/` — Arweave gateway adapter: https://github.com/arweaveteam

### Privacy / Special Modes
- `tor-odoH/` — Tor-oriented / privacy-preserving DoH gateway mode (policy-controlled)

---

## Expected Adapter Layout (Suggested)

Each adapter folder should include:
- `README.md` (this adapter’s scope and how it maps to namespaces)
- `spec.md` (optional adapter-specific details)
- `test-vectors/` (conformance inputs/expected invariants)
- `impl/` (implementation code)
- `bench/` (optional performance tests)

---

## Quality Gates (What “Done” Means)

An adapter is “ready” when it has:
- deterministic request normalization
- bounded work limits (prevent runaway recursion or huge fetches)
- conformance probe support (challenge set execution)
- safe fallback behavior declarations
- no raw user query logging by default

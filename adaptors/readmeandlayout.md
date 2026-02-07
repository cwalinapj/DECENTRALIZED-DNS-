adaptors/
  ens/                      # already exists: ENS read/verify primitives
  solana-sns-bonfida/       # already exists: SNS read/verify primitives
  unstoppable/              # already exists

  web3-name-gateway/        # NEW: orchestrator + mapping + publish flow
    README.md
    src/
      challenge/            # wallet challenge message building (EVM + Solana)
      verify/               # calls ens + sns adaptors to verify ownership
      map/
        routeset/           # Web3 records -> RouteSetV1
        gatewayroutes/      # optional: generate GatewayRoutesV1
      publish/
        network/            # publish RouteSet into ddns network
        chain/              # write commitments (EVM now; Solana later if desired)
        ipfs/               # publish AnchorV1 via adaptors/ipfs (anchor-only)
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

- This respects your existing modular adapters and prevents “ENS logic” from drifting between two places.

⸻

What web3-name-gateway should do (and what it should NOT do)

It SHOULD
	•	provide a single UX/API for users: “link alice.eth → alice.com subdomains via DDNS”
	•	build wallet challenges (EVM + Solana)
	•	call underlying adaptors to verify ownership
	•	map records into RouteSetV1 and/or GatewayRoutesV1
	•	publish:
	•	to your network
	•	to EVM commitments
	•	to IPFS AnchorV1 only

It should NOT
	•	reimplement ENS or SNS chain reading (use adaptors/ens and adaptors/solana-sns-bonfida)
	•	store full RouteSets in IPFS by default

⸻

How to wire to your existing adaptors (clean interfaces)

Define a tiny interface in web3-name-gateway that each underlying adaptor fulfills:

Ownership verifier interface
	•	buildChallenge(params) -> challenge
	•	verifySignature(challenge, signature) -> signer
	•	checkOnchainOwner(name) -> owner
	•	verifyOwnership(name, signer) -> bool

Your ens/ adaptor implements it for .eth.
Your solana-sns-bonfida/ adaptor implements it for .sol.

Record fetch interface (optional)
	•	fetchRecords(name) -> normalizedRecords

Then map/routeset/ converts normalizedRecords → RouteSetV1.

⸻

Where EVM commitments + IPFS anchor-only live

Inside web3-name-gateway/src/publish/:
	•	publish/chain/evm.ts (writes name_id -> seq/exp/routeset_hash)
	•	publish/ipfs/anchor.ts (builds AnchorV1, calls adaptors/ipfs to publish it)

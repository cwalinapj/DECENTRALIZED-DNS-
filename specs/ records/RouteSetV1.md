AnchorV1

Status: Draft
Version: 1
Purpose: Define a minimal “Anchor” object for redundant storage/distribution (e.g., IPFS gateway), enabling clients/watchdogs to detect tampering or equivocation in the decentralized DNS network without storing full RouteSets.

AnchorV1 is intentionally small. It SHOULD be stored on IPFS/pinning services when redundancy is desired, but AnchorV1 is not the primary storage for routing/records. The primary authoritative data is RouteSetV1 distributed via the core network and cached at the edge.

⸻

1. Design Goals
	•	Minimal size (typically ~160–220 bytes + optional CID transport overhead)
	•	Tamper detection by committing to routeset_hash
	•	Replay resistance via seq and exp
	•	Authenticity via Ed25519 signature
	•	No full RR data stored in IPFS by default

⸻

2. Cryptography & Hashing
	•	Signature algorithm: Ed25519
	•	Hash algorithm: BLAKE3-256 (32 bytes)

AnchorV1 is designed to commit to RouteSetV1 via its routeset_hash.

⸻

3. Fields

AnchorV1 contains:
	•	magic: 4 bytes ASCII ANCH
	•	version: u8 = 1
	•	ns_id: u32 (LE)
	•	name_id: 32 bytes
	•	seq: u64 (LE)
	•	exp: u64 (LE) unix seconds
	•	routeset_hash: 32 bytes (BLAKE3-256)
	•	owner_pub: 32 bytes (Ed25519 public key)
	•	sig: 64 bytes (Ed25519 signature)

Total size: 4 + 1 + 4 + 32 + 8 + 8 + 32 + 32 + 64 = 217 bytes

This is the canonical anchor payload; transport wrappers (IPFS CID, multicodec, etc.) are separate.

⸻

4. Canonical Binary Encoding

| Field         | Size | Type  | Description               |
|--------------|-----:|-------|---------------------------|
| magic        | 4    | bytes | ASCII `ANCH`              |
| version      | 1    | u8    | `0x01`                    |
| ns_id        | 4    | u32   | namespace id              |
| name_id      | 32   | bytes | derived identifier        |
| seq          | 8    | u64   | sequence number           |
| exp          | 8    | u64   | expiry unix seconds       |
| routeset_hash| 32   | bytes | hash of the RouteSet      |
| owner_pub    | 32   | bytes | Ed25519 public key        |
| sig          | 64   | bytes | signature                 |



5. Signature Rules

5.1 Signing payload

The signature covers the bytes from magic through owner_pub inclusive, excluding sig.

payload = encode_anchor_without_sig(anchor)
sig = ed25519_sign(owner_priv, payload)

5.2 Verification

Verification succeeds if:
	•	magic == "ANCH"
	•	version == 1
	•	ed25519_verify(owner_pub, payload, sig) == true

⸻

6. Validity Rules (Client/Watchdog)

An AnchorV1 is considered valid only if:
	•	exp is in the future (allow small skew, e.g. ±120s)
	•	seq is >= last accepted seq for this name_id (policy-defined; typically strictly increasing)
	•	name_id matches the requested/observed name (derived from normalization rules)

⸻

7. Matching Anchor to RouteSet

Given:
	•	AnchorV1 with routeset_hash = H
	•	A fetched RouteSetV1

Compute:

H' = BLAKE3_256( canonical_routeset_bytes_including_sig )

Match succeeds if H' == H.

If mismatch:
	•	treat served RouteSet as untrusted
	•	refetch from multiple peers and/or require chain commitment confirmation
	•	watchdogs should emit an incident report

⸻

8. Relationship to Chain Commitments

Recommended minimal on-chain commitment (see specs/chain/commitments.md):
	•	name_id -> (seq, exp, anchor_hash) where:
	•	anchor_hash = BLAKE3_256(anchor_bytes_including_sig) OR
	•	anchor_hash = routeset_hash (even smaller), if your chain stores the RouteSet commitment directly

If the chain stores anchor_hash, clients can validate that the IPFS-fetched AnchorV1 matches chain.

⸻

9. Anti-Equivocation Guidance

Watchdogs SHOULD detect and report:
	•	same (name_id, seq) with different routeset_hash
	•	same (name_id, seq) with different owner_pub
	•	chain commitment mismatch (chain says hash X, network serves Y)

A “conflict proof” format can be introduced later.

⸻

10. Storage Policy

Default policy: store only AnchorV1 on IPFS.

Storing full RouteSets on IPFS is permitted only in explicit “bootstrap mode” and MUST NOT be required for correctness.

⸻











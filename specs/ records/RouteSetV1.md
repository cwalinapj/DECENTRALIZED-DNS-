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














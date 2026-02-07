NameNormalization

Status: Draft
Version: 1
Purpose: Define the canonical name normalization and name_id derivation rules used across all modules (resolver, registry, watchdogs, adaptors, clients).

All components MUST implement these rules identically.

⸻

1. Inputs & Outputs

Input: a user-supplied name string (e.g., Api.Exämple.)
Output:
	•	normalized_name (string)
	•	name_id (32 bytes)

⸻

2. Normalization Algorithm

Given name:
	1.	Trim leading/trailing whitespace.
	2.	Remove trailing dot: if the name ends with . remove exactly one trailing dot.
	3.	Split into labels by ..
	4.	Validate labels:
	•	no empty labels
	•	each label length 1..63 after punycode conversion
	•	total name length <= 253 characters (policy; optional strictness)
	5.	IDN handling:
	•	Convert any Unicode label to Punycode A-label (e.g., xn--...)
	6.	Lowercase the full result (ASCII lowercase).
	7.	Re-join labels with ..

Result: normalized_name is ASCII-only, lowercase, and contains no trailing dot.

⸻

3. Disallowed Names (recommended)

Implementations SHOULD reject:
	•	empty string
	•	any label containing characters outside [a-z0-9-] after punycode/lowercase
	•	labels starting or ending with - (optional policy; DNS allows but many systems restrict)
	•	consecutive dots ..
	•	names exceeding size limits

If your system supports special namespaces (e.g., _service._tcp.example), you may relax the allowed charset accordingly, but you MUST document it here.

⸻

4. Namespace ID

RouteSetV1 and AnchorV1 use a numeric namespace id ns_id (u32).

Example allocations (placeholder):
	•	1 = dDNS (main decentralized DNS namespace)
	•	2 = toll (tollDNS pricing namespace)
	•	etc.

The authoritative mapping MUST live in one place (recommended: specs/registry/namespaces.md).

⸻

5. name_id Derivation

Given:
	•	ns_id (u32)
	•	normalized_name (ASCII string)

Compute:

name_id = BLAKE3_256( LE32(ns_id) || ASCII_BYTES(normalized_name) )

Output is 32 bytes.

6. Test Vectors (required)
Example vectors (placeholders; replace with real computed values)
	1.	Input: Api.Example.
Normalized: api.example
ns_id: 1
name_id: <32-byte hex>
	2.	Input: Exämple.com
Normalized: xn--exmple-cua.com
ns_id: 1
name_id: <32-byte hex>
	3.	Input:  example 
Normalized: example
ns_id: 1
name_id: <32-byte hex>

Note: Once you compute official vectors, all languages MUST match them byte-for-byte

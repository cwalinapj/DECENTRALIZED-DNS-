# NameNormalization

**Status:** Draft  
**Version:** 1  
**Purpose:** Define canonical name normalization and `name_id` derivation
used across all modules (resolver, registry, watchdogs, adaptors,
clients).

All components MUST implement these rules identically.

---

## 1. Outputs

Given an input string `name`, produce:

- `normalized_name` (ASCII lowercase, punycode for IDN, no trailing dot)
- `name_id` (32 bytes)

---

## 2. Normalization Algorithm

Given `name`:

1. Trim leading/trailing whitespace.
2. If name ends with `.` remove exactly one trailing dot.
3. Split by `.` into labels.
4. Reject if any label is empty.
5. Convert Unicode labels to **Punycode A-label** form (`xn--...`).
6. Convert full name to ASCII lowercase.
7. Re-join labels with `.`.

**Result:** `normalized_name` is ASCII-only, lowercase, and has no trailing dot.

---

## 3. Allowed Character Set (Recommended Policy)

After punycode + lowercase:

- labels SHOULD match: `[a-z0-9-]{1,63}`
- names SHOULD have total length <= 253 characters

If your system supports underscore labels (e.g., `_service._tcp`),
document that exception here.

---

## 4. Namespace IDs

RouteSetV1/AnchorV1 use `ns_id` (u32). The mapping is project-defined.

**Example allocation (placeholder):**

- `1` = `dDNS` (main namespace)

Document your final mapping in `specs/chain/namespaces.md` (recommended).

---

## 5. name_id Derivation

Given:

- `ns_id` (u32)
- `normalized_name` (ASCII string)

Compute:
name_id = BLAKE3_256( LE32(ns_id) || ASCII_BYTES(normalized_name) )
Output is 32 bytes.

---

## 6. Test Vectors (To Fill)

This section MUST be updated with computed vectors and used across all languages.

1) Input: `Api.Example.`

- normalized: `api.example`
- ns_id: `1`
- name_id: `<hex32>`

1) Input: `Exämple.com`

- normalized: `xn--exmple-cua.com`
- ns_id: `1`
- name_id: `<hex32>`

# Spam Report Format (Spec)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This spec defines the format of a **Spam Report** emitted by TollDNS
webmail clients when users mark messages as spam/phishing.
Reports are designed to be:

- **domain/DNS-first** (domains/URLs are primary signals),
- privacy-preserving (no raw email content by default),
- compatible with clustering and watchdog confirmation,
- usable for retroactive **token rewards** for validated "reasoned reporting".

Normative unless stated otherwise.

Related:

- Email & anti-spam: `docs/15-email-and-anti-spam.md`
- Policy states: `specs/policy-state-machine.md`

---

## 1) Objectives

A Spam Report MUST:

- identify risky **domains/URLs** and authentication outcomes
- enable campaign clustering without leaking raw content
- support proof that the reporter actually saw the message (anti-farming)
- support delayed/retroactive payout after validation

---

## 2) Privacy Requirements

- MUST NOT include raw email body by default.
- SHOULD NOT include full raw headers by default.
- SHOULD include only:
  - hashed/normalized fingerprints,
  - extracted domains/URLs,
  - coarse auth results,
  - coarse timestamp bucket.

---

## 3) Canonical Object: `SpamReport`

### 3.1 Required Fields

- `report_version` (string) -- semantic version of this spec
- `report_id` (string) -- unique identifier
- `timestamp_bucket` (string/int) -- coarse bucket (e.g., 5m/1h)
- `message_fingerprint` (object) -- hashes only:
  - `header_hash` (hash)
  - `body_structure_hash` (hash; no raw body)
  - `template_hash` (hash; optional but recommended)
- `from_domain` (string) -- domain parsed from From address
- `reply_to_domain` (string|null)
- `return_path_domain` (string|null)
- `extracted_link_domains` (array[string]) -- domains from URLs in message
  (PRIMARY)
- `extracted_link_urls_hashed` (array[hash]) -- optional hashed URLs for
  clustering
- `auth_results` (object):
  - `spf` (enum): `PASS` | `FAIL` | `SOFTFAIL` | `NEUTRAL` | `NONE` |
  `TEMPERROR` | `PERMERROR`
  - `dkim` (enum): `PASS` | `FAIL` | `NONE` | `TEMPERROR` | `PERMERROR`
  - `dmarc` (enum): `PASS` | `FAIL` | `NONE` | `TEMPERROR` | `PERMERROR`
  - `alignment` (enum): `ALIGNED` | `MISALIGNED` | `UNKNOWN`

### 3.2 Reasoned Reporting (REQUIRED)

- `reason_code` (enum; required):
  - `NO_RELATIONSHIP` -- "I don't have an account with this service"
  - `BRAND_MISMATCH` -- "Doesn't look like my bank/service"
  - `SPOOFED_SENDER` -- display-name vs domain mismatch / spoofing suspicion
  - `SUSPICIOUS_LINK` -- link domain looks wrong, punycode, weird subdomain
  - `UNEXPECTED_INVOICE` -- I didn't buy anything
  - `MALWARE_ATTACHMENT` -- unexpected attachment / macro
  - `PHISHING` -- asks for password/OTP/seed or sensitive info
  - `SCAM` -- generic scam classification
  - `OTHER`
- `reason_text` (string|null) -- optional user text, should be
  rate-limited and privacy-scrubbed

### 3.3 Optional Fields (Secondary Signals)

- `sender_ip` (string|null) -- secondary; inbound SMTP only
- `sender_asn` (string|null) -- secondary
- `subject_hash` (hash|null)
- `language_hint` (string|null)
- `client_context` (object|null):
  - `client_platform` (enum): `WEB` | `IOS` | `ANDROID` | `DESKTOP`
  - `client_tier` (enum): `END_USER` | `BUSINESS` | `DEVELOPER`
  - `user_reputation_tier` (enum): `NEW` | `ESTABLISHED` | `TRUSTED`
  (local classification)

---

## 4) Proof-of-View (Anti-Farming Hook)

To prevent reward farming, reports SHOULD include a proof that the
reporter saw the message.

Options (implementation-defined):

- `mailbox_receipt_id` (opaque) -- server-issued token tied to delivery
- `delivery_event_hash` (hash) -- commitment to delivery metadata
- `client_attestation` (signature) -- client signs a nonce provided at
  delivery time

Field:

- `proof_of_view` (object|null):
  - `type` (enum): `MAILBOX_RECEIPT` | `DELIVERY_EVENT_HASH` |
  `CLIENT_ATTESTATION`
  - `value` (string/hash)
  - `signature` (string|null)

---

## 5) Reward Eligibility Hooks (Retroactive)

Rewards are paid only after campaign validation and policy thresholds.

Fields (optional but recommended):

- `reward_intent` (object|null):
  - `eligible` (bool) -- client believes eligible; server decides
  - `payout_address` (string|null) -- native token address
  - `privacy_mode` (enum): `DEFAULT` | `HIGH` (limits optional fields)

Validation outcomes are produced elsewhere (not part of this report), e.g.:

- `cluster_id`
- `confidence_score`
- `confirmed` boolean

---

## 6) Normalization Rules (Deterministic)

To ensure consistent hashes:

- normalize domains to lowercase punycode
- strip tracking params before hashing URLs (when allowed)
- canonicalize header ordering for header_hash
- never hash raw body; hash structural features only (MIME tree, token
  buckets, etc.)

---

## 7) Versioning

- `report_version` uses semantic versioning.
- Clients MUST include the version.
- Servers MUST accept a backward-compatible window as configured by
  policy.

---

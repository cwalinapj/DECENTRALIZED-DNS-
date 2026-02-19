# Notice Tokens (MVP)

Domain Continuity warning banners/interstitials need to be verifiable so users can distinguish real renewal notices from spoofed notices.

## Purpose

- prove a notice came from gateway authority policy logic
- make warnings machine-checkable in UI and client tools
- avoid embedding any client-specific identifiers

## Token Shape

The token payload includes:

- `domain`
- `phase`
- `issued_at`
- `expires_at`
- `reason_codes[]`
- `policy_version`
- `nonce`

The payload is signed with Ed25519.  
Gateway returns:

- `token` (payload + signature)
- `pubkey` (verification key)

## Endpoints (MVP)

- `GET /v1/domain/notice?domain=example.com`
- `POST /v1/domain/notice/verify` with `{ "token": "..." }`

## Why this helps against spoofing

If a phishing page shows a fake warning, it cannot produce a valid signature for the gateway authority key.  
Clients and dashboards can independently verify token authenticity before trusting the message.

## Privacy posture

Notice tokens carry no client IP, wallet, user-agent, or user identity fields.  
They represent domain-level continuity state only.

## Key rotation (roadmap)

MVP uses a single signing key source at runtime.  
Planned hardening:

- explicit key version in token headers
- rolling key IDs (`kid`)
- overlap window for old/new key verification

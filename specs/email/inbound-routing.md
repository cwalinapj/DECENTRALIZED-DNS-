# Inbound Email Routing (Spec)

**Status:** Draft  
**Version:** 1

This spec defines the DNS records, routing rules, and verification flow for
inbound email routing in the decentralized DNS ecosystem.

Related:
- Email & anti-spam overview: `docs/15-email-and-anti-spam.md`

---

## 1) MX Record Format

Domains that opt into inbound routing MUST publish an MX record pointing at
an approved routing target.

**Record format:**

| Field | Value | Notes |
| --- | --- | --- |
| type | `MX` | Required |
| name | `<domain>` | Zone apex or specific hostname |
| priority | integer | Lower number = higher priority |
| target | hostname | Provider-specific mail exchanger |

**Recommended defaults (v1):**

- priority: `10`
- target: `mx.ddns-email.net` (service default)

Example:

```
example.com. 3600 IN MX 10 mx.ddns-email.net.
```

---

## 2) Rule Format (Exact Match + Catch-all)

Routing rules map a recipient to one or more forward targets.

Each rule MUST include:

- `match_type`: `exact` | `catch_all`
- `recipient`: local-part for `exact`, `*` for `catch_all`
- `forward_to`: array of destination email addresses
- `enabled`: boolean

**Exact match:**

```
{
  "match_type": "exact",
  "recipient": "billing",
  "forward_to": ["accounts@example.net"],
  "enabled": true
}
```

**Catch-all:**

```
{
  "match_type": "catch_all",
  "recipient": "*",
  "forward_to": ["ops@example.net"],
  "enabled": true
}
```

Resolution order:

1. All enabled `exact` rules are evaluated first.
2. If no exact rule matches, the first enabled `catch_all` rule applies.
3. If no rules match, the message is rejected with `no_route`.

---

## 3) Verification Flow (DNS TXT Challenge)

Before routing, domain control MUST be proven with a DNS TXT challenge.

1. Control-plane issues a verification token.
2. Domain owner publishes a TXT record:
   - name: `_ddns-email.<domain>`
   - value: `ddns-email-verify=<token>`
3. Control-plane checks DNS until the value is found.
4. The domain transitions from `pending` to `verified`.

Tokens SHOULD expire after 24 hours. Re-verification MUST rotate the token.

---

## 4) Abuse & Rate Limits (Policy Guidance)

Implementations SHOULD enforce rate limits to reduce abuse:

- Max verification attempts: 20 per domain per hour.
- Max rule changes: 100 per domain per day.
- Max forward targets per rule: 5.
- Max total rules per domain: 200.

Requests exceeding limits SHOULD return `rate_limited`.

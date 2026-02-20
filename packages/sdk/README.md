# @ddns/sdk (MVP skeleton)

Minimal TypeScript SDK for gateway resolution.

## API

- `resolve({ baseUrl, name, type })`
- `resolveOrThrow({ baseUrl, name, type })`
- `assertResponseShape(response)`
- `getDomainStatus({ baseUrl, domain })`
- `startDomainVerify({ baseUrl, domain })`
- `renewDomain({ baseUrl, domain, useCredits })`
- `claimContinuity({ baseUrl, domain })`

## Node example

```ts
import { resolveOrThrow } from "@ddns/sdk";

const out = await resolveOrThrow({
  baseUrl: "http://localhost:8054",
  name: "netflix.com",
  type: "A"
});
console.log("confidence:", out.confidence);
console.log("rrset_hash:", out.rrset_hash);
console.log("chosen_upstream:", out.chosen_upstream?.url);
console.log("upstreams_used:", out.upstreams_used?.map((u) => `${u.url}:${u.status}:${u.rtt_ms}ms`));
console.log("answers_count:", out.answers.length);
```

## Domain continuity example (Node)

```ts
import {
  getDomainStatus,
  startDomainVerify,
  renewDomain,
  claimContinuity
} from "@ddns/sdk";

const baseUrl = "https://gateway.example.com";
const domain = "example.com";

const status = await getDomainStatus({ baseUrl, domain });
console.log(status.phase, status.eligible, status.next_steps);

const verify = await startDomainVerify({ baseUrl, domain });
console.log(verify.verification_method, verify.txt_record_name, verify.txt_record_value);

const claim = await claimContinuity({ baseUrl, domain });
console.log(claim.accepted, claim.reason_codes);

const renew = await renewDomain({ baseUrl, domain, useCredits: true });
console.log(renew.accepted, renew.credits_applied_estimate);
```

## Worker example

```ts
import { getDomainStatus, resolveOrThrow } from "@ddns/sdk";

export default {
  async fetch(): Promise<Response> {
    const out = await resolveOrThrow({
      baseUrl: "https://gateway.example.com",
      name: "example.dns",
      type: "A"
    });
    const continuity = await getDomainStatus({ baseUrl: "https://gateway.example.com", domain: "example.com" });
    return new Response(JSON.stringify({
      name: out.name,
      confidence: out.confidence,
      rrset_hash: out.rrset_hash,
      upstreams_used: out.upstreams_used,
      answers_count: out.answers.length,
      continuity_phase: continuity.phase
    }, null, 2), {
      headers: { "content-type": "application/json" }
    });
  }
};
```

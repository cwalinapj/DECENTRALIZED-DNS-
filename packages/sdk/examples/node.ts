import { resolveOrThrow } from "../src/index.js";

const out = await resolveOrThrow({
  baseUrl: process.env.DDNS_GATEWAY_URL || "http://localhost:8054",
  name: process.env.DDNS_NAME || "netflix.com",
  type: "A"
});

console.log(
  JSON.stringify(
    {
      name: out.name,
      type: out.type,
      confidence: out.confidence ?? null,
      rrset_hash: out.rrset_hash ?? null,
      chosen_upstream: out.chosen_upstream?.url ?? null,
      upstreams_used:
        out.upstreams_used?.map((u) => ({
          url: u.url,
          status: u.status,
          rtt_ms: u.rtt_ms ?? u.rttMs ?? null,
          answers_count: u.answers_count ?? u.answersCount ?? null
        })) ?? [],
      answers_count: out.answers.length
    },
    null,
    2
  )
);

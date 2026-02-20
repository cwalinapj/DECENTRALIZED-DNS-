import { resolve } from "../src/index.js";

const out = await resolve({
  baseUrl: process.env.DDNS_GATEWAY_URL || "http://localhost:8054",
  name: process.env.DDNS_NAME || "netflix.com",
  type: "A"
});

console.log("name:", out.name);
console.log("confidence:", out.confidence);
console.log("chosen_upstream:", out.chosen_upstream?.url || "n/a");
console.log("upstreams_used:", out.upstreams_used?.map((u) => `${u.url} (${u.status}, ${u.rtt_ms}ms)`) || []);
console.log("answers:", out.answers);

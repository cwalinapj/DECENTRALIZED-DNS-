import { resolve } from "../src/index.js";

const out = await resolve({
  baseUrl: process.env.DDNS_GATEWAY_URL || "http://localhost:8054",
  name: process.env.DDNS_NAME || "netflix.com",
  type: "A"
});

console.log(JSON.stringify(out, null, 2));

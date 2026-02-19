import { resolve } from "../src/index.js";

export default {
  async fetch(): Promise<Response> {
    const out = await resolve({
      baseUrl: "http://localhost:8054",
      name: "netflix.com",
      type: "A"
    });

    return new Response(JSON.stringify(out), {
      headers: { "content-type": "application/json" }
    });
  }
};

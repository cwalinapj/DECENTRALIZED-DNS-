import { resolve } from "../src/index.js";

export default {
  async fetch(): Promise<Response> {
    const out = await resolve({
      baseUrl: "http://localhost:8054",
      name: "netflix.com",
      type: "A"
    });

    return new Response(
      JSON.stringify(
        {
          name: out.name,
          confidence: out.confidence,
          chosen_upstream: out.chosen_upstream,
          upstreams_used: out.upstreams_used,
          answers: out.answers
        },
        null,
        2
      ),
      {
      headers: { "content-type": "application/json" }
      }
    );
  }
};

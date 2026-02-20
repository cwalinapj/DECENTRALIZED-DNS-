import { resolveOrThrow } from "../src/index.js";

const workerHandler = {
  async fetch(): Promise<Response> {
    const out = await resolveOrThrow({
      baseUrl: "http://localhost:8054",
      name: "netflix.com",
      type: "A"
    });

    return new Response(
      JSON.stringify(
        {
          name: out.name,
          confidence: out.confidence,
          rrset_hash: out.rrset_hash,
          chosen_upstream: out.chosen_upstream,
          upstreams_used: out.upstreams_used,
          answers_count: out.answers.length
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
export default workerHandler;

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await workerHandler.fetch();
  console.log(await res.text());
}

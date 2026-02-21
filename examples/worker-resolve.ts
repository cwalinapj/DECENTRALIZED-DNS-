type Env = { GATEWAY_BASE_URL?: string };

async function getJson(baseUrl: string, path: string): Promise<any> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`);
  if (!res.ok) throw new Error(`request failed: ${res.status} ${path}`);
  return res.json();
}

const worker = {
  async fetch(_request: Request, env: Env): Promise<Response> {
    const baseUrl = env.GATEWAY_BASE_URL || "http://127.0.0.1:8054";
    const out = await getJson(baseUrl, "/v1/resolve?name=netflix.com&type=A");
    return new Response(
      JSON.stringify(
        {
          name: out.name,
          confidence: out.confidence,
          rrset_hash: out.rrset_hash,
          upstreams_used: out.upstreams_used
        },
        null,
        2
      ),
      { headers: { "content-type": "application/json" } }
    );
  }
};

export default worker;

if (import.meta.url === `file://${process.argv[1]}`) {
  const main = async () => {
    const res = await worker.fetch(new Request("http://local.test"), {
      GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL
    });
    console.log(await res.text());
  };

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

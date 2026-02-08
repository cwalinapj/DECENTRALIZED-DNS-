export type Env = {
  HOSTING_DOMAIN: string;
  PAGES_BASE: string;
  MAPPING_KV: KVNamespace;
};

function extractSubdomain(host: string, domain: string): string | null {
  if (!host.endsWith(domain)) return null;
  const trimmed = host.replace(domain, "").replace(/\.$/, "");
  const sub = trimmed.replace(/\.$/, "");
  if (!sub) return null;
  return sub;
}

function normalizeSubdomain(name: string): string {
  return name.toLowerCase();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const host = request.headers.get("host") || "";
    const subdomain = extractSubdomain(host, env.HOSTING_DOMAIN);
    if (!subdomain) {
      return new Response("not_found", { status: 404 });
    }
    const key = normalizeSubdomain(subdomain);
    const siteId = await env.MAPPING_KV.get(key);
    if (!siteId) return new Response("not_found", { status: 404 });

    const target = new URL(env.PAGES_BASE);
    target.pathname = `/sites/${siteId}${url.pathname}`;
    target.search = url.search;

    const proxyReq = new Request(target.toString(), request);
    return fetch(proxyReq);
  }
};

export const __test__ = { extractSubdomain, normalizeSubdomain };

export type ResolveType = "A" | "AAAA";

export type ResolveAnswer = {
  name: string;
  type: string;
  data: string;
  ttl?: number;
};

export type UpstreamUsed = {
  url: string;
  rtt_ms: number;
  status: string;
  answers_count: number;
};

export type ResolveResponse = {
  name: string;
  type: ResolveType;
  answers: ResolveAnswer[];
  ttl_s: number;
  source: string;
  confidence?: "high" | "medium" | "low";
  upstreams_used?: UpstreamUsed[];
  chosen_upstream?: { url: string; rtt_ms: number };
  cache?: { hit: boolean; stale_used?: boolean };
  status?: string;
  rrset_hash?: string;
};

export type ResolveOptions = {
  baseUrl: string;
  name: string;
  type?: ResolveType;
  fetchImpl?: typeof fetch;
};

export async function resolve(options: ResolveOptions): Promise<ResolveResponse> {
  const { baseUrl, name, type = "A", fetchImpl = fetch } = options;
  const url = new URL("/v1/resolve", baseUrl);
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);

  const res = await fetchImpl(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" }
  });

  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(`resolve_failed:${res.status}:${body?.error || res.statusText}`);
  }

  return (await res.json()) as ResolveResponse;
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

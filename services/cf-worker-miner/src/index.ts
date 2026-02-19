type Env = {
  UPSTREAMS?: string;
  TIMEOUT_MS?: string;
  OVERLAP_RATIO?: string;
  RECEIPT_ENDPOINT?: string;
};

type UpstreamHit = {
  url: string;
  rtt_ms: number;
  status: string;
  answers_count: number;
  ips: string[];
  ttl_s: number;
  rrset_hash: string;
};

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(hash);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, "");
}

function mapType(type: number | string): string {
  if (typeof type === "string") return type.toUpperCase();
  if (type === 1) return "A";
  if (type === 28) return "AAAA";
  if (type === 5) return "CNAME";
  return String(type);
}

async function queryOne(url: string, name: string, qtype: "A" | "AAAA", timeoutMs: number): Promise<UpstreamHit> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const u = new URL(url);
    u.searchParams.set("name", name);
    u.searchParams.set("type", qtype);
    const res = await fetch(u.toString(), { headers: { accept: "application/dns-json" }, signal: ctrl.signal });
    if (!res.ok) {
      return { url, rtt_ms: Date.now() - started, status: `HTTP_${res.status}`, answers_count: 0, ips: [], ttl_s: 1, rrset_hash: await sha256Hex(`${qtype}|${name}|HTTP`) };
    }
    const json: any = await res.json();
    const status = Number(json?.Status ?? 2) === 0 ? "NOERROR" : Number(json?.Status ?? 2) === 3 ? "NXDOMAIN" : "ERROR";
    const answers = (Array.isArray(json?.Answer) ? json.Answer : [])
      .map((a: any) => ({ name: normalizeName(String(a?.name || "")), type: mapType(a?.type), data: String(a?.data || ""), ttl: Math.max(1, Number(a?.TTL || 60)) }))
      .filter((a: any) => a.name && a.type && a.data);

    const byName = new Map<string, any[]>();
    for (const a of answers) {
      const prev = byName.get(a.name) || [];
      prev.push(a);
      byName.set(a.name, prev);
    }

    let current = normalizeName(name);
    for (let i = 0; i < 10; i++) {
      const cn = (byName.get(current) || []).find((r) => r.type === "CNAME");
      if (!cn) break;
      current = normalizeName(cn.data);
    }

    const finals = (byName.get(current) || []).filter((r) => r.type === qtype);
    const ips = [...new Set(finals.map((r) => r.data))].sort((a, b) => a.localeCompare(b));
    const ttl_s = finals.length ? Math.min(...finals.map((r) => r.ttl)) : status === "NXDOMAIN" ? 30 : 1;
    const rrset_hash = await sha256Hex(`${qtype}|${current}|${ips.join(",")}`);

    return {
      url,
      rtt_ms: Date.now() - started,
      status,
      answers_count: ips.length,
      ips,
      ttl_s,
      rrset_hash
    };
  } catch {
    return { url, rtt_ms: Date.now() - started, status: "TIMEOUT", answers_count: 0, ips: [], ttl_s: 1, rrset_hash: await sha256Hex(`${qtype}|${name}|TIMEOUT`) };
  } finally {
    clearTimeout(timer);
  }
}

function overlapRatio(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let shared = 0;
  for (const ip of sa) {
    if (sb.has(ip)) shared++;
  }
  return shared / Math.max(1, Math.min(sa.size, sb.size));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/v1/health") {
      return Response.json({ ok: true, service: "cf-worker-miner" });
    }

    if (url.pathname !== "/resolve") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const name = normalizeName(url.searchParams.get("name") || "");
    const qtype = (url.searchParams.get("type") || "A").toUpperCase() === "AAAA" ? "AAAA" : "A";
    if (!name) return Response.json({ error: "missing_name" }, { status: 400 });

    const upstreams = (env.UPSTREAMS || "https://cloudflare-dns.com/dns-query,https://dns.google/resolve")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const timeoutMs = Number(env.TIMEOUT_MS || "2000");
    const overlapRatio = Number(env.OVERLAP_RATIO || "0.34");

    const hits = await Promise.all(upstreams.map((u) => queryOne(u, name, qtype, timeoutMs)));
    const ok = hits.filter((h) => h.status === "NOERROR" && h.ips.length > 0);

    let confidence: "high" | "medium" | "low" = "low";
    let chosen = ok.sort((a, b) => a.rtt_ms - b.rtt_ms)[0] || hits.sort((a, b) => a.rtt_ms - b.rtt_ms)[0];

    if (ok.length >= 2) {
      const byHash = new Map<string, UpstreamHit[]>();
      for (const h of ok) byHash.set(h.rrset_hash, [...(byHash.get(h.rrset_hash) || []), h]);
      const best = [...byHash.values()].sort((a, b) => b.length - a.length)[0] || [];
      if (best.length >= 2) {
        confidence = "high";
        chosen = best.sort((a, b) => a.rtt_ms - b.rtt_ms)[0];
      } else {
        const a = ok[0];
        const b = ok[1];
        const ratio = overlapRatio(a.ips, b.ips);
        if (ratio >= overlapRatio) confidence = "medium";
      }
    }

    const ttlBase = chosen?.ttl_s || 30;
    const ttlCap = confidence === "high" ? 300 : confidence === "medium" ? 120 : 30;
    const ttl_s = Math.max(1, Math.min(ttlBase, ttlCap));

    const response = {
      name,
      type: qtype,
      status: chosen?.status || "ERROR",
      answers: chosen?.ips || [],
      ttl_s,
      rrset_hash: chosen?.rrset_hash || "",
      confidence,
      upstreams_used: hits.map((h) => ({
        url: h.url,
        rtt_ms: h.rtt_ms,
        status: h.status,
        answers_count: h.answers_count
      })),
      chosen_upstream: chosen ? { url: chosen.url, rtt_ms: chosen.rtt_ms } : null
    };

    if (env.RECEIPT_ENDPOINT) {
      fetch(env.RECEIPT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          observed_at_unix: Math.floor(Date.now() / 1000),
          ...response
        })
      }).catch(() => undefined);
    }

    const statusCode = response.status === "NOERROR" || response.status === "NXDOMAIN" ? 200 : 502;
    return Response.json(response, { status: statusCode });
  }
};

export interface Env {
  MINER_API_URL: string;
  DOH_URL: string;
  NAMES: string;
  QTYPE: string;
  COLO_FALLBACK?: string;
}

type DnsAnswer = { name: string; type: number; TTL: number; data: string };

function bytesToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

async function resolveDns(doh: string, name: string, qtype: string): Promise<DnsAnswer[]> {
  const u = new URL(doh);
  u.searchParams.set("name", name);
  u.searchParams.set("type", qtype);
  const r = await fetch(u.toString(), { headers: { accept: "application/dns-json" } });
  if (!r.ok) throw new Error(`upstream_${r.status}`);
  const j: any = await r.json();
  return Array.isArray(j?.Answer) ? j.Answer : [];
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/run") {
      return new Response("ok", { status: 200 });
    }

    const names = (env.NAMES || "example.com").split(",").map((s) => s.trim()).filter(Boolean);
    const qtype = env.QTYPE || "A";
    const colo = (request as any).cf?.colo || env.COLO_FALLBACK || "cf-worker";

    const receipts: Array<{ name: string; name_hash: string; rrset_hash: string; colo: string }> = [];

    for (const name of names) {
      try {
        const ans = await resolveDns(env.DOH_URL, name, qtype);
        if (!ans.length) continue;
        const nameHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name.toLowerCase()));
        const canonical = ans
          .map((a) => `${a.name.toLowerCase()}|${a.type}|${a.data}|${a.TTL}`)
          .sort()
          .join("\n");
        const rrHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
        receipts.push({
          name,
          name_hash: bytesToHex(nameHash),
          rrset_hash: bytesToHex(rrHash),
          colo,
        });
      } catch {
        // skip
      }
    }

    const resp = await fetch(env.MINER_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receipts }),
    });
    const txt = await resp.text();
    return new Response(txt, { status: resp.status, headers: { "content-type": "application/json" } });
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function rrsetHash(name, type, answers) {
  const normalized = [...new Set(answers.map((a) => String(a).trim()))].sort();
  const input = `${type}|${name.toLowerCase()}|${normalized.join(",")}`;
  const bytes = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", bytes).then((buf) => {
    const b = new Uint8Array(buf);
    return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  });
}

async function dohResolve(url, name, type, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const u = new URL(url);
    u.searchParams.set("name", name);
    u.searchParams.set("type", type);
    const res = await fetch(u.toString(), {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });
    const body = await res.json();
    const answers = (body.Answer || [])
      .filter((a) => Number(a.type) === (type === "AAAA" ? 28 : 1))
      .map((a) => a.data);
    const ttl_s = Math.max(1, Math.min(...(body.Answer || []).map((a) => Number(a.TTL) || 60), 300));
    return {
      ok: true,
      url,
      rtt_ms: Date.now() - start,
      status: body.Status === 0 ? "NOERROR" : `STATUS_${body.Status}`,
      answers,
      ttl_s: Number.isFinite(ttl_s) ? ttl_s : 60,
    };
  } catch (e) {
    return {
      ok: false,
      url,
      rtt_ms: Date.now() - start,
      status: "ERROR",
      answers: [],
      ttl_s: 30,
      error: String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

function chooseConsensus(results, overlapRatio) {
  const good = results.filter((r) => r.ok && r.answers.length > 0);
  if (good.length === 0) return { chosen: null, confidence: "low" };
  if (good.length === 1) return { chosen: good[0], confidence: "low" };

  const [a, b] = good;
  const as = new Set(a.answers);
  const bs = new Set(b.answers);
  const overlap = [...as].filter((x) => bs.has(x)).length;
  const denom = Math.max(as.size, bs.size, 1);
  const ratio = overlap / denom;

  if (ratio >= 1) {
    return { chosen: a.rtt_ms <= b.rtt_ms ? a : b, confidence: "high" };
  }
  if (ratio >= overlapRatio) {
    return { chosen: a.rtt_ms <= b.rtt_ms ? a : b, confidence: "medium" };
  }
  return { chosen: a.rtt_ms <= b.rtt_ms ? a : b, confidence: "low" };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/v1/health") {
      return json({ ok: true, service: "cf-worker-miner" });
    }

    if (url.pathname === "/resolve") {
      const name = (url.searchParams.get("name") || "").trim().toLowerCase();
      const type = (url.searchParams.get("type") || "A").toUpperCase() === "AAAA" ? "AAAA" : "A";
      if (!name) return json({ error: "missing name" }, 400);

      const upstreams = String(env.UPSTREAMS || "https://cloudflare-dns.com/dns-query,https://dns.google/dns-query")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      const timeoutMs = Number(env.TIMEOUT_MS || "2500");
      const overlapRatio = Number(env.OVERLAP_RATIO || "0.34");

      const results = await Promise.all(upstreams.map((u) => dohResolve(u, name, type, timeoutMs)));
      const { chosen, confidence } = chooseConsensus(results, overlapRatio);
      if (!chosen) {
        return json({
          name,
          type,
          source: "recursive",
          confidence: "low",
          error: "all_upstreams_failed",
          upstreams_used: results.map((r) => ({ url: r.url, rtt_ms: r.rtt_ms, status: r.status, answers_count: 0 })),
          answers: [],
          ttl_s: 30,
        }, 502);
      }

      const hash = await rrsetHash(name, type, chosen.answers);
      const payload = {
        name,
        type,
        source: "recursive",
        confidence,
        rrset_hash: hash,
        answers: chosen.answers,
        ttl_s: chosen.ttl_s,
        chosen_upstream: { url: chosen.url, rtt_ms: chosen.rtt_ms },
        upstreams_used: results.map((r) => ({
          url: r.url,
          rtt_ms: r.rtt_ms,
          status: r.status,
          answers_count: r.answers.length,
        })),
      };

      if (env.RECEIPT_ENDPOINT) {
        // fire-and-forget MVP observation post
        req.waitUntil(fetch(String(env.RECEIPT_ENDPOINT), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ observations: [payload] }),
        }).catch(() => {}));
      }

      return json(payload);
    }

    return json({ error: "not_found" }, 404);
  },
};

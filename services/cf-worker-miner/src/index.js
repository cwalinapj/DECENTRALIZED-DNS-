function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function normalizeName(name) {
  return (name || "").trim().toLowerCase().replace(/\.$/, "");
}

function parseType(t) {
  const x = (t || "A").toUpperCase();
  return x === "AAAA" ? 28 : 1;
}

function typeLabel(qtype) {
  return qtype === 28 ? "AAAA" : "A";
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function uniqueSorted(items) {
  return Array.from(new Set(items)).sort();
}

function overlapRatio(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = a.filter((x) => sb.has(x)).length;
  const denom = Math.max(sa.size, sb.size, 1);
  return inter / denom;
}

async function fetchDoh(url, name, qtype, timeoutMs) {
  const started = Date.now();
  const q = new URL(url);
  q.searchParams.set("name", name);
  q.searchParams.set("type", String(qtype));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(q.toString(), {
      headers: { accept: "application/dns-json" },
      signal: ctrl.signal
    });
    const body = await res.json();
    const rtt = Date.now() - started;
    const records = (body.Answer || [])
      .filter((x) => x && x.type === qtype && typeof x.data === "string")
      .map((x) => x.data);
    const ttl = (body.Answer || [])
      .filter((x) => x && x.type === qtype && Number.isFinite(x.TTL))
      .map((x) => x.TTL);
    return {
      url,
      status: body.Status === 0 ? "NOERROR" : `DNS_${body.Status}`,
      rtt_ms: rtt,
      answers: uniqueSorted(records),
      ttl_s: ttl.length ? Math.min(...ttl) : 30
    };
  } catch (_err) {
    return {
      url,
      status: "ERROR",
      rtt_ms: Date.now() - started,
      answers: [],
      ttl_s: 30
    };
  } finally {
    clearTimeout(timer);
  }
}

function chooseConfidence(results, minOverlap) {
  const ok = results.filter((r) => r.answers.length > 0 && r.status === "NOERROR");
  if (ok.length === 0) return "low";
  if (ok.length === 1) return "low";

  const ratios = [];
  for (let i = 0; i < ok.length; i += 1) {
    for (let j = i + 1; j < ok.length; j += 1) {
      ratios.push(overlapRatio(ok[i].answers, ok[j].answers));
    }
  }
  const best = Math.max(...ratios, 0);
  if (best >= 1) return "high";
  if (best >= minOverlap) return "medium";
  return "low";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/v1/health") {
      return json({ ok: true, service: "cf-worker-miner" });
    }
    if (url.pathname !== "/resolve") {
      return json({ error: "not_found" }, 404);
    }

    const name = normalizeName(url.searchParams.get("name"));
    const qtype = parseType(url.searchParams.get("type"));
    if (!name) return json({ error: "missing_name" }, 400);

    const upstreams = (env.UPSTREAMS || "").split(",").map((x) => x.trim()).filter(Boolean);
    const timeoutMs = Number(env.TIMEOUT_MS || 2000);
    const overlap = Number(env.OVERLAP_RATIO || 0.34);
    const results = await Promise.all(upstreams.map((u) => fetchDoh(u, name, qtype, timeoutMs)));
    const success = results.filter((r) => r.answers.length > 0 && r.status === "NOERROR");
    const chosen = success.sort((a, b) => a.rtt_ms - b.rtt_ms)[0] || results[0];
    const answers = chosen ? chosen.answers : [];
    const ttl = chosen ? chosen.ttl_s : 30;
    const rrset_hash = await sha256Hex(`${typeLabel(qtype)}|${name}|${answers.join(",")}`);

    return json({
      name,
      type: typeLabel(qtype),
      answers,
      ttl_s: ttl,
      source: "recursive",
      confidence: chooseConfidence(results, overlap),
      rrset_hash,
      chosen_upstream: chosen ? { url: chosen.url, rtt_ms: chosen.rtt_ms } : null,
      upstreams_used: results.map((r) => ({
        url: r.url,
        rtt_ms: r.rtt_ms,
        status: r.status,
        answers_count: r.answers.length
      }))
    });
  }
};

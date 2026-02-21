type Env = {
  UPSTREAMS?: string;
  TIMEOUT_MS?: string;
  OVERLAP_RATIO?: string;
  TTL_CAP_S?: string;
};

type ResolveType = "A" | "AAAA";

type Answer = {
  name: string;
  type: ResolveType;
  data: string;
  ttl: number;
};

type UpstreamUsed = {
  url: string;
  rtt_ms: number;
  status: string;
  answers_count: number;
};

type ResolvePayload = {
  name: string;
  type: ResolveType;
  status: "NOERROR" | "NXDOMAIN" | "SERVFAIL";
  answers: Answer[];
  ttl_s: number;
  confidence: "high" | "medium" | "low";
  rrset_hash: string;
  upstreams_used: UpstreamUsed[];
  chosen_upstream: { url: string; rtt_ms: number } | null;
  cache: { hit: boolean };
};

const DEMO_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TollDNS Public Demo</title>
  <style>
    :root {
      --bg: #f5f7fa;
      --card: #ffffff;
      --ink: #142033;
      --muted: #5e6b7d;
      --accent: #0b63ce;
      --ok: #157347;
      --warn: #b54708;
    }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(180deg, #f9fbff 0%, #eef3f9 100%);
      color: var(--ink);
      min-height: 100vh;
    }
    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 28px 18px 40px;
    }
    .card {
      background: var(--card);
      border: 1px solid #dce5f1;
      border-radius: 14px;
      padding: 16px;
      margin-top: 16px;
      box-shadow: 0 8px 28px rgba(15, 31, 61, 0.08);
    }
    h1 { margin: 0; font-size: 1.6rem; }
    .sub { margin-top: 6px; color: var(--muted); font-size: 0.95rem; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    input, select, button, textarea {
      font: inherit;
      border-radius: 10px;
      border: 1px solid #cfd8e6;
      padding: 9px 11px;
    }
    input, select { min-width: 160px; }
    button {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
      cursor: pointer;
    }
    button.secondary { background: #f3f7fd; color: #11365f; border-color: #b5c9e4; }
    textarea {
      width: 100%;
      min-height: 54px;
      resize: vertical;
      background: #fbfdff;
      color: #1f3147;
    }
    .kpi {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .kpi > div {
      border: 1px solid #d7e2f1;
      border-radius: 10px;
      padding: 10px;
      background: #f8fbff;
    }
    .k { color: var(--muted); font-size: 0.85rem; margin-bottom: 4px; }
    .v { font-weight: 600; }
    .status { margin-top: 8px; font-size: 0.95rem; }
    .status.ok { color: var(--ok); }
    .status.warn { color: var(--warn); }
    pre {
      margin: 10px 0 0;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid #d8e3f2;
      background: #f7fbff;
      overflow: auto;
      max-height: 300px;
      font-size: 0.84rem;
    }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 4px 0; font-size: 0.9rem; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>TollDNS Public Resolver Demo</h1>
    <div class="sub">Resolve any domain and inspect confidence, rrset hash, chosen upstream, and upstream audit details.</div>

    <div class="card">
      <div class="row">
        <input id="name" type="text" value="netflix.com" aria-label="Domain name" />
        <select id="type" aria-label="Record type">
          <option value="A">A</option>
          <option value="AAAA">AAAA</option>
        </select>
        <button id="resolve-btn" type="button">Resolve</button>
      </div>
      <div class="row">
        <textarea id="share-link" class="mono" readonly></textarea>
      </div>
      <div class="row">
        <button id="copy-share" type="button" class="secondary">Copy share link</button>
      </div>
      <div id="status" class="status"></div>
    </div>

    <div class="card">
      <div class="kpi">
        <div><div class="k">Confidence</div><div class="v" id="k-confidence">-</div></div>
        <div><div class="k">RRSet Hash</div><div class="v mono" id="k-hash">-</div></div>
        <div><div class="k">Chosen Upstream</div><div class="v mono" id="k-upstream">-</div></div>
        <div><div class="k">Cache Hit</div><div class="v" id="k-cache">-</div></div>
      </div>
    </div>

    <div class="card">
      <div class="k">Answers</div>
      <ul id="answers"></ul>
      <div class="k" style="margin-top: 10px;">Upstreams Used</div>
      <ul id="upstreams"></ul>
      <div class="k" style="margin-top: 10px;">Raw JSON</div>
      <pre id="raw-json">{}</pre>
    </div>
  </div>

  <script>
    const nameEl = document.getElementById("name");
    const typeEl = document.getElementById("type");
    const resolveBtn = document.getElementById("resolve-btn");
    const shareEl = document.getElementById("share-link");
    const copyBtn = document.getElementById("copy-share");
    const statusEl = document.getElementById("status");
    const answersEl = document.getElementById("answers");
    const upstreamsEl = document.getElementById("upstreams");
    const rawEl = document.getElementById("raw-json");
    const confEl = document.getElementById("k-confidence");
    const hashEl = document.getElementById("k-hash");
    const upEl = document.getElementById("k-upstream");
    const cacheEl = document.getElementById("k-cache");

    function toShareUrl(name, type) {
      const u = new URL(window.location.href);
      u.pathname = "/";
      u.search = "";
      u.searchParams.set("name", name);
      u.searchParams.set("type", type);
      return u.toString();
    }

    function updateShare() {
      const name = (nameEl.value || "").trim();
      const type = typeEl.value || "A";
      shareEl.value = name ? toShareUrl(name, type) : "";
    }

    async function runResolve() {
      const name = (nameEl.value || "").trim();
      const type = typeEl.value || "A";
      if (!name) {
        statusEl.textContent = "Enter a domain name.";
        statusEl.className = "status warn";
        return;
      }
      updateShare();
      statusEl.textContent = "Resolving...";
      statusEl.className = "status";

      const url = "/v1/resolve?name=" + encodeURIComponent(name) + "&type=" + encodeURIComponent(type);
      try {
        const res = await fetch(url);
        const payload = await res.json();
        rawEl.textContent = JSON.stringify(payload, null, 2);

        confEl.textContent = payload.confidence || "-";
        hashEl.textContent = payload.rrset_hash || "-";
        upEl.textContent = payload.chosen_upstream ? payload.chosen_upstream.url : "-";
        cacheEl.textContent = payload.cache && typeof payload.cache.hit === "boolean" ? String(payload.cache.hit) : "-";

        answersEl.innerHTML = "";
        for (const answer of payload.answers || []) {
          const li = document.createElement("li");
          li.textContent = answer.data + " (ttl=" + answer.ttl + ")";
          answersEl.appendChild(li);
        }
        if (!answersEl.children.length) {
          const li = document.createElement("li");
          li.textContent = "(no answers)";
          answersEl.appendChild(li);
        }

        upstreamsEl.innerHTML = "";
        for (const up of payload.upstreams_used || []) {
          const li = document.createElement("li");
          li.textContent = up.url + " | status=" + up.status + " | rtt_ms=" + up.rtt_ms + " | answers_count=" + up.answers_count;
          upstreamsEl.appendChild(li);
        }
        if (!upstreamsEl.children.length) {
          const li = document.createElement("li");
          li.textContent = "(no upstream data)";
          upstreamsEl.appendChild(li);
        }

        if (res.ok) {
          statusEl.textContent = "Resolve complete.";
          statusEl.className = "status ok";
        } else {
          statusEl.textContent = "Resolve returned HTTP " + res.status;
          statusEl.className = "status warn";
        }
      } catch (err) {
        statusEl.textContent = "Resolve failed: " + (err && err.message ? err.message : String(err));
        statusEl.className = "status warn";
      }
    }

    resolveBtn.addEventListener("click", runResolve);
    nameEl.addEventListener("input", updateShare);
    typeEl.addEventListener("change", updateShare);
    copyBtn.addEventListener("click", async () => {
      updateShare();
      if (!shareEl.value) return;
      try {
        await navigator.clipboard.writeText(shareEl.value);
        statusEl.textContent = "Share link copied.";
        statusEl.className = "status ok";
      } catch {
        statusEl.textContent = "Could not copy automatically; copy from the text box.";
        statusEl.className = "status warn";
      }
    });

    const params = new URLSearchParams(window.location.search);
    const initialName = (params.get("name") || "").trim();
    const initialType = (params.get("type") || "A").toUpperCase() === "AAAA" ? "AAAA" : "A";
    if (initialName) nameEl.value = initialName;
    typeEl.value = initialType;
    updateShare();
    if (nameEl.value.trim()) runResolve();
  </script>
</body>
</html>`;

type UpstreamHit = {
  url: string;
  rtt_ms: number;
  status: "NOERROR" | "NXDOMAIN" | "SERVFAIL";
  answers: Answer[];
  rrset_hash: string;
  ttl_s: number;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\.+$/, "");
}

function parseType(raw: string | null): ResolveType {
  return (raw || "A").toUpperCase() === "AAAA" ? "AAAA" : "A";
}

function isLikelyDns(name: string): boolean {
  return normalizeName(name).endsWith(".dns");
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

function overlapRatio(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const a = new Set(left);
  const b = new Set(right);
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

function parseUpstreams(env: Env): string[] {
  return (env.UPSTREAMS || "https://cloudflare-dns.com/dns-query,https://dns.google/resolve")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function minTtl(answers: Answer[], fallback = 30): number {
  if (!answers.length) return fallback;
  return Math.max(1, Math.min(...answers.map((a) => Math.max(1, a.ttl))));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function queryUpstream(url: string, name: string, qtype: ResolveType, timeoutMs: number): Promise<UpstreamHit> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set("name", name);
    requestUrl.searchParams.set("type", qtype);

    const response = await fetch(requestUrl.toString(), {
      headers: { accept: "application/dns-json" },
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        url,
        rtt_ms: Date.now() - started,
        status: "SERVFAIL",
        answers: [],
        rrset_hash: await sha256Hex(`${qtype}|${name}|HTTP_${response.status}`),
        ttl_s: 1
      };
    }

    const body = (await response.json()) as {
      Status?: number;
      Answer?: Array<{ name?: string; type?: number; data?: string; TTL?: number }>;
    };

    const statusCode = Number(body.Status ?? 2);
    if (statusCode === 3) {
      return {
        url,
        rtt_ms: Date.now() - started,
        status: "NXDOMAIN",
        answers: [],
        rrset_hash: await sha256Hex(`${qtype}|${name}|NXDOMAIN`),
        ttl_s: 30
      };
    }

    if (statusCode !== 0) {
      return {
        url,
        rtt_ms: Date.now() - started,
        status: "SERVFAIL",
        answers: [],
        rrset_hash: await sha256Hex(`${qtype}|${name}|STATUS_${statusCode}`),
        ttl_s: 1
      };
    }

    const rows = Array.isArray(body.Answer) ? body.Answer : [];
    const answers = rows
      .map((row) => {
        const type = Number(row.type);
        if ((qtype === "A" && type !== 1) || (qtype === "AAAA" && type !== 28)) return null;
        const data = String(row.data || "").trim();
        if (!data) return null;
        return {
          name,
          type: qtype,
          data,
          ttl: Math.max(1, Number(row.TTL || 60))
        } as Answer;
      })
      .filter((row): row is Answer => row !== null)
      .sort((a, b) => a.data.localeCompare(b.data));

    const rrsetHash = await sha256Hex(`${qtype}|${name}|${answers.map((a) => a.data).join(",")}`);

    return {
      url,
      rtt_ms: Date.now() - started,
      status: "NOERROR",
      answers,
      rrset_hash: rrsetHash,
      ttl_s: minTtl(answers, 30)
    };
  } catch {
    return {
      url,
      rtt_ms: Date.now() - started,
      status: "SERVFAIL",
      answers: [],
      rrset_hash: await sha256Hex(`${qtype}|${name}|TIMEOUT`),
      ttl_s: 1
    };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveName(nameRaw: string, qtype: ResolveType, env: Env): Promise<ResolvePayload> {
  const name = normalizeName(nameRaw);

  if (!name) {
    throw new Error("missing_name");
  }

  if (isLikelyDns(name)) {
    return {
      name,
      type: qtype,
      status: "NXDOMAIN",
      answers: [],
      ttl_s: 30,
      confidence: "low",
      rrset_hash: await sha256Hex(`${qtype}|${name}|dns_not_supported`),
      upstreams_used: [],
      chosen_upstream: null,
      cache: { hit: false }
    };
  }

  const cacheKey = new Request(`https://ddns-demo-gateway.local/cache/${qtype}/${name}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const payload = (await cached.json()) as ResolvePayload;
    return { ...payload, cache: { hit: true } };
  }

  const upstreams = parseUpstreams(env);
  const timeoutMs = Number(env.TIMEOUT_MS || "2000");
  const overlapThreshold = Number(env.OVERLAP_RATIO || "0.34");
  const ttlCap = Math.max(30, Number(env.TTL_CAP_S || "300"));

  const hits = await Promise.all(upstreams.map((u) => queryUpstream(u, name, qtype, timeoutMs)));
  const valid = hits.filter((hit) => hit.status === "NOERROR" && hit.answers.length > 0);

  let status: ResolvePayload["status"] = "SERVFAIL";
  let confidence: ResolvePayload["confidence"] = "low";
  let chosen: UpstreamHit | null = null;
  let answers: Answer[] = [];
  let ttl_s = 30;
  let rrset_hash = await sha256Hex(`${qtype}|${name}|empty`);

  if (valid.length > 0) {
    status = "NOERROR";
    const byHash = new Map<string, UpstreamHit[]>();
    for (const hit of valid) {
      byHash.set(hit.rrset_hash, [...(byHash.get(hit.rrset_hash) || []), hit]);
    }
    const group = [...byHash.values()].sort((a, b) => b.length - a.length)[0] || [];
    chosen = group.sort((a, b) => a.rtt_ms - b.rtt_ms)[0] || valid.sort((a, b) => a.rtt_ms - b.rtt_ms)[0];
    answers = chosen.answers;
    rrset_hash = chosen.rrset_hash;

    if (group.length >= 2) {
      confidence = "high";
    } else if (valid.length >= 2) {
      const ratio = overlapRatio(valid[0].answers.map((a) => a.data), valid[1].answers.map((a) => a.data));
      confidence = ratio >= overlapThreshold ? "medium" : "low";
    }

    const confidenceCap = confidence === "high" ? ttlCap : confidence === "medium" ? Math.min(ttlCap, 120) : 30;
    ttl_s = Math.max(1, Math.min(minTtl(chosen.answers, 30), confidenceCap));
  } else if (hits.some((hit) => hit.status === "NXDOMAIN")) {
    status = "NXDOMAIN";
    confidence = hits.filter((hit) => hit.status === "NXDOMAIN").length >= 2 ? "medium" : "low";
    ttl_s = 30;
    rrset_hash = await sha256Hex(`${qtype}|${name}|nxdomain`);
    chosen = hits.find((hit) => hit.status === "NXDOMAIN") || null;
  } else {
    chosen = hits.sort((a, b) => a.rtt_ms - b.rtt_ms)[0] || null;
  }

  const payload: ResolvePayload = {
    name,
    type: qtype,
    status,
    answers,
    ttl_s,
    confidence,
    rrset_hash,
    upstreams_used: hits.map((hit) => ({
      url: hit.url,
      rtt_ms: hit.rtt_ms,
      status: hit.status,
      answers_count: hit.answers.length
    })),
    chosen_upstream: chosen ? { url: chosen.url, rtt_ms: chosen.rtt_ms } : null,
    cache: { hit: false }
  };

  const cacheResponse = new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttl_s}`
    }
  });
  await caches.default.put(cacheKey, cacheResponse.clone());

  return payload;
}

type ParsedQuestion = {
  id: number;
  flags: number;
  name: string;
  type: ResolveType | "OTHER";
  qtypeRaw: number;
};

function decodeName(buf: Uint8Array, offset: number, depth = 0): { name: string; nextOffset: number } {
  if (depth > 8) throw new Error("dns_name_pointer_depth");
  const labels: string[] = [];
  let pos = offset;
  let jumped = false;
  let nextOffset = offset;

  while (pos < buf.length) {
    const len = buf[pos];
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1];
      const target = decodeName(buf, ptr, depth + 1);
      labels.push(target.name);
      if (!jumped) nextOffset = pos + 2;
      jumped = true;
      break;
    }
    if (len === 0) {
      if (!jumped) nextOffset = pos + 1;
      break;
    }
    const start = pos + 1;
    const end = start + len;
    labels.push(new TextDecoder().decode(buf.slice(start, end)));
    pos = end;
  }

  return { name: normalizeName(labels.filter(Boolean).join(".")), nextOffset };
}

function parseDnsQuery(buf: Uint8Array): ParsedQuestion {
  if (buf.length < 12) throw new Error("dns_query_too_short");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const id = view.getUint16(0);
  const flags = view.getUint16(2);
  const qdCount = view.getUint16(4);
  if (qdCount < 1) throw new Error("dns_missing_question");

  const parsed = decodeName(buf, 12);
  const qtypeRaw = view.getUint16(parsed.nextOffset);
  const type: ParsedQuestion["type"] = qtypeRaw === 1 ? "A" : qtypeRaw === 28 ? "AAAA" : "OTHER";

  return { id, flags, name: parsed.name, type, qtypeRaw };
}

function encodeDnsName(name: string): Uint8Array {
  const parts = normalizeName(name).split(".").filter(Boolean);
  const out: number[] = [];
  for (const label of parts) {
    const bytes = new TextEncoder().encode(label);
    out.push(bytes.length, ...bytes);
  }
  out.push(0);
  return new Uint8Array(out);
}

function parseIPv4(value: string): Uint8Array | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return new Uint8Array(nums);
}

function parseIPv6(value: string): Uint8Array | null {
  const source = value.toLowerCase();
  const parts = source.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts[1] ? parts[1].split(":") : [];
  const missing = 8 - (head.filter(Boolean).length + tail.filter(Boolean).length);
  if (missing < 0) return null;
  const blocks = [
    ...head.filter(Boolean),
    ...new Array(parts.length === 2 ? missing : 0).fill("0"),
    ...tail.filter(Boolean)
  ];
  if (blocks.length !== 8) return null;

  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const n = Number.parseInt(blocks[i], 16);
    if (!Number.isFinite(n) || n < 0 || n > 0xffff) return null;
    out[i * 2] = (n >> 8) & 0xff;
    out[i * 2 + 1] = n & 0xff;
  }
  return out;
}

function encodeDnsResponse(query: ParsedQuestion, answers: Answer[], rcode: number): Uint8Array {
  const qname = encodeDnsName(query.name);
  const responseFlags = 0x8000 | 0x0100 | 0x0080 | (rcode & 0x000f); // QR + RD + RA + rcode

  const answerBlocks: Uint8Array[] = [];
  for (const answer of answers) {
    const addr = answer.type === "A" ? parseIPv4(answer.data) : parseIPv6(answer.data);
    if (!addr) continue;
    const block = new Uint8Array(2 + 2 + 2 + 4 + 2 + addr.length);
    const view = new DataView(block.buffer);
    view.setUint16(0, 0xc00c); // pointer to query name
    view.setUint16(2, answer.type === "A" ? 1 : 28);
    view.setUint16(4, 1);
    view.setUint32(6, Math.max(1, answer.ttl));
    view.setUint16(10, addr.length);
    block.set(addr, 12);
    answerBlocks.push(block);
  }

  const header = new Uint8Array(12);
  const hv = new DataView(header.buffer);
  hv.setUint16(0, query.id);
  hv.setUint16(2, responseFlags);
  hv.setUint16(4, 1);
  hv.setUint16(6, answerBlocks.length);
  hv.setUint16(8, 0);
  hv.setUint16(10, 0);

  const question = new Uint8Array(qname.length + 4);
  question.set(qname, 0);
  const qv = new DataView(question.buffer);
  qv.setUint16(qname.length, query.qtypeRaw);
  qv.setUint16(qname.length + 2, 1);

  const total = header.length + question.length + answerBlocks.reduce((sum, b) => sum + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  out.set(header, offset);
  offset += header.length;
  out.set(question, offset);
  offset += question.length;
  for (const block of answerBlocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}

async function handleResolve(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "";
  const qtype = parseType(url.searchParams.get("type"));

  if (!name) {
    return Response.json({ error: "missing_name" }, { status: 400 });
  }

  const resolved = await resolveName(name, qtype, env);
  const statusCode = resolved.status === "SERVFAIL" ? 502 : 200;
  return Response.json(resolved, { status: statusCode });
}

async function handleDoH(req: Request, env: Env): Promise<Response> {
  let wire = new Uint8Array();
  if (req.method === "GET") {
    const dns = new URL(req.url).searchParams.get("dns");
    if (!dns) return new Response("missing dns param", { status: 400 });
    wire = decodeBase64Url(dns);
  } else {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/dns-message")) {
      return new Response("invalid content-type", { status: 415 });
    }
    wire = new Uint8Array(await req.arrayBuffer());
  }

  let query: ParsedQuestion;
  try {
    query = parseDnsQuery(wire);
  } catch {
    return new Response("invalid dns query", { status: 400 });
  }

  let rcode = 0;
  let answers: Answer[] = [];
  if (query.type === "OTHER") {
    rcode = 4; // NOTIMP
  } else {
    const resolved = await resolveName(query.name, query.type, env);
    if (resolved.status === "NOERROR") {
      answers = resolved.answers;
      rcode = 0;
    } else if (resolved.status === "NXDOMAIN") {
      rcode = 3;
    } else {
      rcode = 2;
    }
  }

  const responseWire = encodeDnsResponse(query, answers, rcode);
  return new Response(responseWire, {
    status: 200,
    headers: {
      "content-type": "application/dns-message",
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/" || url.pathname === "/demo") {
      return new Response(DEMO_PAGE_HTML, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    if (url.pathname === "/healthz") {
      return Response.json({ ok: true, service: "ddns-demo-gateway" });
    }

    if (url.pathname === "/v1/resolve") {
      return handleResolve(req, env);
    }

    if (url.pathname === "/dns-query" && (req.method === "GET" || req.method === "POST")) {
      return handleDoH(req, env);
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }
};

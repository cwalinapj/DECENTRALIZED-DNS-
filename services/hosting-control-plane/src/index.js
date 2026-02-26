import http from "node:http";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || "8092");
const HOST = process.env.HOST || "0.0.0.0";
const EDGE_CNAME = process.env.HOSTING_EDGE_CNAME || "edge.tolldns.io";
const MAX_BODY_BYTES = 64 * 1024;
const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const CF_OAUTH_AUTHORIZE_URL = "https://dash.cloudflare.com/oauth2/auth";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const PROVIDER_NS1 = (process.env.PROVIDER_NS1 || "ns1.tahoecarspa.com").trim().toLowerCase();
const PROVIDER_NS2 = (process.env.PROVIDER_NS2 || "ns2.tahoecarspa.com").trim().toLowerCase();
const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const CONNECTIONS_FILE = path.join(CACHE_DIR, "cloudflare_connections.json");
const TOKENS_FILE = path.join(CACHE_DIR, "cloudflare_tokens.enc.json");
const POINTS_FILE = path.join(CACHE_DIR, "hosting_points.json");
const POINTS_INSTALL_WEB_HOST = Number(process.env.POINTS_INSTALL_WEB_HOST || "250");
const POINTS_NS_VERIFIED = Number(process.env.POINTS_NS_VERIFIED || "120");
const POINTS_DNS_ACTIONS = Number(process.env.POINTS_DNS_ACTIONS || "80");
const POINTS_WORKER_TEMPLATE = Number(process.env.POINTS_WORKER_TEMPLATE || "20");

// MVP state store (JSON + encrypted token bag). Swap to DB for production.
const connections = new Map();
const tokenSecrets = new Map();
const oauthStates = new Map();
const pointsEvents = [];
const pointsBalancesByUser = new Map();
const pointsBalancesByUserDomain = new Map();
const pointsIdempotency = new Map();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString()
  });
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html).toString()
  });
  res.end(html);
}

function normalizeDomain(domain) {
  return typeof domain === "string" ? domain.trim().toLowerCase().replace(/\.+$/, "") : "";
}

function buildTokenRef(token) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return `cf_tok_${hash.slice(0, 16)}`;
}

function createVerificationToken() {
  return crypto.randomBytes(16).toString("hex");
}

function safeIsoNow() {
  return new Date().toISOString();
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  ensureCacheDir();
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function tokenCipherKey() {
  const raw = String(process.env.CF_TOKEN_STORE_KEY || "").trim();
  if (!raw) return null;
  if (raw.startsWith("base64:")) {
    const decoded = Buffer.from(raw.slice(7), "base64");
    return decoded.length >= 32 ? decoded.subarray(0, 32) : crypto.createHash("sha256").update(decoded).digest();
  }
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptToken(token) {
  const key = tokenCipherKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

function decryptToken(record) {
  const key = tokenCipherKey();
  if (!key || !record) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64"));
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(record.data, "base64")),
      decipher.final()
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

function serializeConnection(row) {
  return {
    connection_id: row.connection_id,
    user_id: row.user_id,
    zone_id: row.zone_id,
    zone_name: row.zone_name || null,
    domain: row.domain || null,
    token_ref: row.token_ref,
    created_at: row.created_at,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    last_verified_at: row.last_verified_at,
    verification: row.verification || null
  };
}

function toPublicConnection(row) {
  return {
    connection_id: row.connection_id,
    user_id: row.user_id,
    zone_id: row.zone_id,
    zone_name: row.zone_name || null,
    domain: row.domain || null,
    token_ref: row.token_ref,
    created_at: row.created_at,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    last_verified_at: row.last_verified_at
  };
}

function persistConnections() {
  writeJsonFile(CONNECTIONS_FILE, {
    updated_at: safeIsoNow(),
    connections: Array.from(connections.values()).map(serializeConnection)
  });
}

function pointsSnapshot() {
  const userBalances = {};
  for (const [userId, value] of pointsBalancesByUser.entries()) {
    userBalances[userId] = value;
  }
  const userDomainBalances = {};
  for (const [userId, domains] of pointsBalancesByUserDomain.entries()) {
    userDomainBalances[userId] = {};
    for (const [domain, value] of domains.entries()) {
      userDomainBalances[userId][domain] = value;
    }
  }
  const idempotency = {};
  for (const [key, eventId] of pointsIdempotency.entries()) {
    idempotency[key] = eventId;
  }
  return {
    updated_at: safeIsoNow(),
    events: pointsEvents,
    balances_by_user: userBalances,
    balances_by_user_domain: userDomainBalances,
    idempotency
  };
}

function persistPointsStore() {
  writeJsonFile(POINTS_FILE, pointsSnapshot());
}

function persistTokenSecrets() {
  const encryptedTokens = {};
  for (const [tokenRef, token] of tokenSecrets.entries()) {
    const encrypted = encryptToken(token);
    if (encrypted) encryptedTokens[tokenRef] = encrypted;
  }
  writeJsonFile(TOKENS_FILE, {
    updated_at: safeIsoNow(),
    encrypted_tokens: encryptedTokens
  });
}

function loadStore() {
  const filePayload = readJsonFile(CONNECTIONS_FILE, { connections: [] });
  const rows = Array.isArray(filePayload?.connections) ? filePayload.connections : [];
  for (const row of rows) {
    if (row?.connection_id) {
      connections.set(row.connection_id, {
        connection_id: row.connection_id,
        user_id: row.user_id,
        zone_id: row.zone_id || null,
        zone_name: row.zone_name || null,
        domain: row.domain || null,
        token_ref: row.token_ref,
        created_at: row.created_at || safeIsoNow(),
        scopes: Array.isArray(row.scopes) ? row.scopes : [],
        last_verified_at: row.last_verified_at || null,
        verification: row.verification || null
      });
    }
  }

  const tokenPayload = readJsonFile(TOKENS_FILE, { encrypted_tokens: {} });
  const encryptedTokens = tokenPayload?.encrypted_tokens || {};
  for (const [tokenRef, encrypted] of Object.entries(encryptedTokens)) {
    const token = decryptToken(encrypted);
    if (token) tokenSecrets.set(tokenRef, token);
  }

  const pointsPayload = readJsonFile(POINTS_FILE, {});
  const events = Array.isArray(pointsPayload?.events) ? pointsPayload.events : [];
  for (const evt of events) {
    if (evt?.event_id && evt?.user_id) pointsEvents.push(evt);
  }
  const userBalances = pointsPayload?.balances_by_user || {};
  for (const [userId, value] of Object.entries(userBalances)) {
    pointsBalancesByUser.set(userId, Number(value) || 0);
  }
  const domainBalances = pointsPayload?.balances_by_user_domain || {};
  for (const [userId, domains] of Object.entries(domainBalances)) {
    const dm = new Map();
    for (const [domain, value] of Object.entries(domains || {})) {
      dm.set(normalizeDomain(domain), Number(value) || 0);
    }
    pointsBalancesByUserDomain.set(userId, dm);
  }
  const idempotency = pointsPayload?.idempotency || {};
  for (const [key, eventId] of Object.entries(idempotency)) {
    if (key && eventId) pointsIdempotency.set(key, String(eventId));
  }
}

loadStore();

function readJson(req, res, onBody) {
  let raw = "";
  let bytes = 0;
  let rejected = false;
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_BODY_BYTES && !rejected) {
      rejected = true;
      sendJson(res, 413, { error: "request_too_large" });
      req.destroy();
      return;
    }
    if (!rejected) raw += chunk;
  });
  req.on("end", () => {
    if (rejected) return;
    try {
      const body = raw ? JSON.parse(raw) : {};
      return onBody(body);
    } catch (err) {
      return sendJson(res, 400, { error: String(err?.message || err) });
    }
  });
}

async function cloudflareJson(token, pathName, init = {}, fetchImpl = globalThis.__cloudflareFetch || globalThis.fetch) {
  const res = await fetchImpl(`${CF_API_BASE}${pathName}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await res.json();
  if (!res.ok || payload?.success === false) {
    const message = payload?.errors?.[0]?.message || "cloudflare_error";
    throw new Error(message);
  }
  return payload;
}

function pruneOauthStates(nowMs = Date.now()) {
  for (const [state, entry] of oauthStates.entries()) {
    if (nowMs - Number(entry?.created_at_ms || 0) > OAUTH_STATE_TTL_MS) {
      oauthStates.delete(state);
    }
  }
}

function htmlConnectPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Connect Cloudflare</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 2rem; max-width: 900px; }
      fieldset { margin: 1rem 0; padding: 1rem; }
      input, button, select { padding: 0.45rem; margin: 0.2rem 0; }
      code, pre { background: #f6f8fa; padding: 0.3rem; border-radius: 6px; }
      pre { overflow: auto; }
      .muted { color: #57606a; }
    </style>
  </head>
  <body>
    <h1>Connect Cloudflare</h1>
    <p>Choose OAuth (recommended) or API token (MVP). Then select zone, verify TXT ownership, and apply NS/gateway DNS actions.</p>

    <fieldset>
      <legend>Path A: OAuth</legend>
      <label>User ID <input id="oauthUser" value="user-demo" /></label>
      <button id="oauthBtn" type="button">Start OAuth</button>
      <div class="muted">Requires CF_OAUTH_CLIENT_ID and CF_OAUTH_REDIRECT_URI.</div>
    </fieldset>

    <fieldset>
      <legend>Path B: API Token (MVP)</legend>
      <label>User ID <input id="apiUser" value="user-demo" /></label><br />
      <label>API token <input id="apiToken" type="password" placeholder="cf-token" /></label><br />
      <label>Scopes (comma-separated) <input id="apiScopes" value="Zone:Read,DNS:Edit" /></label><br />
      <button id="connectBtn" type="button">Connect</button>
      <div id="connectOut" class="muted"></div>
    </fieldset>

    <fieldset>
      <legend>After connect</legend>
      <label>Connection ID <input id="connId" /></label>
      <label>User ID <input id="pointsUser" value="user-demo" /></label>
      <button id="zonesBtn" type="button">List zones</button>
      <button id="pointsBtn" type="button">Check points</button>
      <select id="zoneSelect"></select>
      <button id="chooseZoneBtn" type="button">Select zone</button>
      <hr />
      <label>Domain <input id="verifyDomain" value="example.com" /></label>
      <button id="verifyBtn" type="button">Verify TXT + NS</button>
      <hr />
      <label>Gateway target <input id="gatewayTarget" value="edge.tolldns.io" /></label>
      <label><input id="deployWorker" type="checkbox" /> Include Worker template action</label>
      <button id="applyBtn" type="button">Create/Update DNS actions</button>
      <pre id="result"></pre>
    </fieldset>

    <script>
      const out = (value) => { document.getElementById("result").textContent = JSON.stringify(value, null, 2); };

      document.getElementById("oauthBtn").addEventListener("click", async () => {
        const user = document.getElementById("oauthUser").value.trim();
        const res = await fetch("/v1/cloudflare/oauth/start?user_id=" + encodeURIComponent(user));
        const body = await res.json();
        if (body.authorization_url) {
          window.location.href = body.authorization_url;
        } else {
          out(body);
        }
      });

      document.getElementById("connectBtn").addEventListener("click", async () => {
        const user_id = document.getElementById("apiUser").value.trim();
        const api_token = document.getElementById("apiToken").value.trim();
        const scopes = document.getElementById("apiScopes").value.split(",").map((x) => x.trim()).filter(Boolean);
        const res = await fetch("/v1/cloudflare/connect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ user_id, api_token, scopes })
        });
        const body = await res.json();
        document.getElementById("connectOut").textContent = body.connection_id || body.error || "connected";
        if (body.connection_id) {
          document.getElementById("connId").value = body.connection_id;
          document.getElementById("pointsUser").value = body.user_id || user_id;
        }
        out(body);
      });

      document.getElementById("zonesBtn").addEventListener("click", async () => {
        const connId = document.getElementById("connId").value.trim();
        const res = await fetch("/v1/cloudflare/connections/" + encodeURIComponent(connId) + "/zones");
        const body = await res.json();
        const sel = document.getElementById("zoneSelect");
        sel.innerHTML = "";
        (body.zones || []).forEach((z) => {
          const opt = document.createElement("option");
          opt.value = z.id;
          opt.textContent = String(z.name) + " (" + String(z.id) + ")";
          sel.appendChild(opt);
        });
        out(body);
      });

      document.getElementById("chooseZoneBtn").addEventListener("click", async () => {
        const connId = document.getElementById("connId").value.trim();
        const zone_id = document.getElementById("zoneSelect").value;
        const res = await fetch("/v1/cloudflare/connections/" + encodeURIComponent(connId) + "/zone", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ zone_id })
        });
        out(await res.json());
      });

      document.getElementById("pointsBtn").addEventListener("click", async () => {
        const user_id = document.getElementById("pointsUser").value.trim();
        const domain = document.getElementById("verifyDomain").value.trim();
        const res = await fetch("/v1/points/balance?user_id=" + encodeURIComponent(user_id) + "&domain=" + encodeURIComponent(domain));
        out(await res.json());
      });

      document.getElementById("verifyBtn").addEventListener("click", async () => {
        const connId = document.getElementById("connId").value.trim();
        const domain = document.getElementById("verifyDomain").value.trim();
        const res = await fetch("/v1/cloudflare/connections/" + encodeURIComponent(connId) + "/verify-domain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain })
        });
        out(await res.json());
      });

      document.getElementById("applyBtn").addEventListener("click", async () => {
        const connId = document.getElementById("connId").value.trim();
        const domain = document.getElementById("verifyDomain").value.trim();
        const gateway_target = document.getElementById("gatewayTarget").value.trim();
        const deploy_worker = document.getElementById("deployWorker").checked;
        const res = await fetch("/v1/cloudflare/connections/" + encodeURIComponent(connId) + "/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain, gateway_target, deploy_worker })
        });
        out(await res.json());
      });
    </script>
  </body>
</html>`;
}

function buildSitePlan(body) {
  const domain = normalizeDomain(body?.domain);
  const originUrl = typeof body?.origin_url === "string" ? body.origin_url.trim() : "";
  const staticDir = typeof body?.static_dir === "string" ? body.static_dir.trim() : "";
  if (!domain) throw new Error("missing_domain");
  if ((originUrl ? 1 : 0) + (staticDir ? 1 : 0) !== 1) throw new Error("provide_exactly_one_origin_url_or_static_dir");

  const target = originUrl ? `origin:${originUrl}` : `static:${staticDir}`;
  return {
    domain,
    source: originUrl ? { origin_url: originUrl } : { static_dir: staticDir },
    edge_provider: "cloudflare",
    delivery_mode: "whitelabel",
    dns_records: [{ type: "CNAME", name: domain, value: EDGE_CNAME, proxied: true, ttl: 300 }],
    origin_binding: target,
    tls_status: {
      status: "pending_validation",
      message: "Cloudflare edge certificate provisioning is in progress"
    }
  };
}

async function resolveTxtRecords(name, resolveTxtImpl = globalThis.__dnsResolveTxt || dns.resolveTxt) {
  try {
    const rows = await resolveTxtImpl(name);
    return Array.isArray(rows) ? rows.map((row) => row.join("")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function resolveNsRecords(domain, resolveNsImpl = globalThis.__dnsResolveNs || dns.resolveNs) {
  try {
    const rows = await resolveNsImpl(domain);
    return Array.isArray(rows) ? rows.map((v) => String(v).trim().toLowerCase().replace(/\.+$/, "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function expectedProviderNameservers() {
  return [PROVIDER_NS1, PROVIDER_NS2].filter(Boolean);
}

function rowById(connectionId) {
  return connections.get(connectionId) || null;
}

function persistAll() {
  persistConnections();
  persistTokenSecrets();
  persistPointsStore();
}

function saveConnection(row) {
  connections.set(row.connection_id, row);
  persistAll();
}

function userDomainBalance(userId, domain) {
  const domainMap = pointsBalancesByUserDomain.get(userId);
  if (!domainMap) return 0;
  return Number(domainMap.get(domain) || 0);
}

function addPoints({
  userId,
  domain,
  points,
  reason,
  idempotencyKey,
  metadata
}) {
  const normalizedDomain = normalizeDomain(domain);
  const amount = Number(points) || 0;
  if (!userId || !normalizedDomain || amount <= 0) {
    return { awarded: false, reason: "invalid_points_request", points_awarded: 0, total_points: Number(pointsBalancesByUser.get(userId) || 0) };
  }
  if (idempotencyKey && pointsIdempotency.has(idempotencyKey)) {
    return {
      awarded: false,
      points_awarded: 0,
      reason: "duplicate_event",
      event_id: pointsIdempotency.get(idempotencyKey),
      total_points: Number(pointsBalancesByUser.get(userId) || 0),
      domain_points: userDomainBalance(userId, normalizedDomain)
    };
  }
  const eventId = crypto.randomUUID();
  const evt = {
    event_id: eventId,
    user_id: userId,
    domain: normalizedDomain,
    points: amount,
    reason,
    created_at: safeIsoNow(),
    metadata: metadata || {}
  };
  pointsEvents.push(evt);
  pointsBalancesByUser.set(userId, Number(pointsBalancesByUser.get(userId) || 0) + amount);
  const domainMap = pointsBalancesByUserDomain.get(userId) || new Map();
  domainMap.set(normalizedDomain, Number(domainMap.get(normalizedDomain) || 0) + amount);
  pointsBalancesByUserDomain.set(userId, domainMap);
  if (idempotencyKey) pointsIdempotency.set(idempotencyKey, eventId);
  persistPointsStore();
  return {
    awarded: true,
    event_id: eventId,
    points_awarded: amount,
    total_points: Number(pointsBalancesByUser.get(userId) || 0),
    domain_points: Number(domainMap.get(normalizedDomain) || 0)
  };
}

function pointsBalanceResponse(userId, maybeDomain = "") {
  const totalPoints = Number(pointsBalancesByUser.get(userId) || 0);
  const domains = Array.from(pointsBalancesByUserDomain.get(userId)?.entries() || []).map(([domain, points]) => ({
    domain,
    points: Number(points) || 0
  }));
  const normalizedDomain = normalizeDomain(maybeDomain);
  return {
    user_id: userId,
    total_points: totalPoints,
    domain: normalizedDomain || null,
    domain_points: normalizedDomain ? userDomainBalance(userId, normalizedDomain) : null,
    domains,
    updated_at: safeIsoNow()
  };
}

function requireConnection(connectionId, res) {
  const row = rowById(connectionId);
  if (!row) {
    sendJson(res, 404, { error: "connection_not_found" });
    return null;
  }
  return row;
}

function readConnectionToken(req, row) {
  const headerToken = String(req.headers["x-cloudflare-token"] || "").trim();
  if (headerToken) return headerToken;
  return tokenSecrets.get(row.token_ref) || "";
}

async function listZones(token) {
  const payload = await cloudflareJson(token, "/zones?per_page=50");
  return Array.isArray(payload?.result)
    ? payload.result.map((z) => ({ id: z.id, name: z.name, status: z.status }))
    : [];
}

async function upsertDnsRecord(token, zoneId, record) {
  const type = String(record.type || "").toUpperCase();
  const name = String(record.name || "").trim();
  const content = String(record.value || "").trim();
  const ttl = Number(record.ttl || 300);
  if (!type || !name || !content) throw new Error("invalid_dns_record");

  const query = `/zones/${encodeURIComponent(zoneId)}/dns_records?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`;
  const existingPayload = await cloudflareJson(token, query);
  const existing = Array.isArray(existingPayload?.result) ? existingPayload.result[0] : null;
  const body = {
    type,
    name,
    content,
    ttl,
    proxied: record.proxied === true
  };

  if (existing?.id) {
    const updated = await cloudflareJson(
      token,
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(existing.id)}`,
      { method: "PUT", body: JSON.stringify(body) }
    );
    return { action: "updated", id: updated?.result?.id || existing.id, ...body };
  }

  const created = await cloudflareJson(token, `/zones/${encodeURIComponent(zoneId)}/dns_records`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return { action: "created", id: created?.result?.id || null, ...body };
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/healthz") {
      return sendJson(res, 200, { ok: true, edge_provider: "cloudflare" });
    }

    if (req.method === "GET" && pathname === "/connect-cloudflare") {
      return sendHtml(res, 200, htmlConnectPage());
    }

    if (req.method === "GET" && pathname === "/v1/cloudflare/oauth/start") {
      const clientId = (process.env.CF_OAUTH_CLIENT_ID || "").trim();
      const redirectUri = (process.env.CF_OAUTH_REDIRECT_URI || "").trim();
      const userId = String(url.searchParams.get("user_id") || "").trim();
      if (!clientId || !redirectUri || !userId) {
        return sendJson(res, 400, { error: "missing_oauth_configuration_or_user_id" });
      }
      pruneOauthStates();
      const state = crypto.randomBytes(16).toString("hex");
      oauthStates.set(state, { user_id: userId, created_at_ms: Date.now() });
      const authUrl = `${CF_OAUTH_AUTHORIZE_URL}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
      return sendJson(res, 200, { authorization_url: authUrl, state });
    }

    if (req.method === "POST" && pathname === "/v1/cloudflare/connect") {
      readJson(req, res, (body) => {
        const userId = String(body?.user_id || "").trim();
        const apiToken = String(body?.api_token || "").trim();
        const oauthToken = String(body?.oauth_token || "").trim();
        const scopes = Array.isArray(body?.scopes) ? body.scopes.map((s) => String(s).trim()).filter(Boolean) : [];
        if (!userId) return sendJson(res, 400, { error: "missing_user_id" });
        if ((!apiToken && !oauthToken) || (apiToken && oauthToken)) {
          return sendJson(res, 400, { error: "provide_exactly_one_oauth_token_or_api_token" });
        }

        const token = apiToken || oauthToken;
        const now = safeIsoNow();
        const connectionId = crypto.randomUUID();
        const tokenRef = buildTokenRef(token);
        tokenSecrets.set(tokenRef, token);

        const row = {
          connection_id: connectionId,
          user_id: userId,
          zone_id: null,
          zone_name: null,
          domain: null,
          token_ref: tokenRef,
          created_at: now,
          scopes,
          last_verified_at: null,
          verification: null
        };
        saveConnection(row);
        const userPoints = pointsBalanceResponse(userId);

        return sendJson(res, 200, {
          ...toPublicConnection(row),
          token_storage: tokenCipherKey() ? "encrypted_file" : "memory_only",
          points: userPoints
        });
      });
      return;
    }

    if (req.method === "GET" && pathname === "/v1/cloudflare/zones") {
      const token = String(req.headers["x-cloudflare-token"] || "").trim();
      if (!token) return sendJson(res, 400, { error: "missing_api_token" });
      listZones(token)
        .then((zones) => sendJson(res, 200, { zones }))
        .catch((err) => sendJson(res, 400, { error: String(err?.message || err) }));
      return;
    }

    const connZonesMatch = pathname.match(/^\/v1\/cloudflare\/connections\/([^/]+)\/zones$/);
    if (req.method === "GET" && connZonesMatch) {
      const connectionId = decodeURIComponent(connZonesMatch[1]);
      const row = requireConnection(connectionId, res);
      if (!row) return;
      const token = readConnectionToken(req, row);
      if (!token) {
        return sendJson(res, 400, { error: "missing_connection_token" });
      }
      listZones(token)
        .then((zones) => sendJson(res, 200, { connection_id: connectionId, zones }))
        .catch((err) => sendJson(res, 400, { error: String(err?.message || err) }));
      return;
    }

    const zoneMatch = pathname.match(/^\/v1\/cloudflare\/connections\/([^/]+)\/zone$/);
    if (req.method === "POST" && zoneMatch) {
      readJson(req, res, (body) => {
        const connectionId = decodeURIComponent(zoneMatch[1]);
        const row = requireConnection(connectionId, res);
        if (!row) return;
        const zoneId = String(body?.zone_id || "").trim();
        const zoneName = String(body?.zone_name || "").trim() || null;
        if (!zoneId) return sendJson(res, 400, { error: "missing_zone_id" });
        const updated = { ...row, zone_id: zoneId, zone_name: zoneName };
        saveConnection(updated);
        return sendJson(res, 200, toPublicConnection(updated));
      });
      return;
    }

    const verifyMatch = pathname.match(/^\/v1\/cloudflare\/connections\/([^/]+)\/verify-domain$/);
    if (req.method === "POST" && verifyMatch) {
      readJson(req, res, (body) => {
        const connectionId = decodeURIComponent(verifyMatch[1]);
        const row = requireConnection(connectionId, res);
        if (!row) return;
        const domain = normalizeDomain(body?.domain || row.domain);
        if (!domain) return sendJson(res, 400, { error: "missing_domain" });
        const verificationValue = row.verification?.txt_value || createVerificationToken();
        const txtName = `_tolldns-verification.${domain}`;

        Promise.all([resolveTxtRecords(txtName), resolveNsRecords(domain)])
          .then(([txtValues, nameservers]) => {
            const txtPresent = txtValues.includes(verificationValue);
            const expectedNs = expectedProviderNameservers();
            const delegated = expectedNs.every((ns) => nameservers.includes(ns));

            const status = txtPresent && delegated
              ? "verified"
              : txtPresent
                ? "pending_delegation"
                : "pending_verification";

            const updated = {
              ...row,
              domain,
              last_verified_at: status === "verified" ? safeIsoNow() : row.last_verified_at,
              verification: {
                txt_name: txtName,
                txt_value: verificationValue,
                txt_present: txtPresent,
                delegated,
                nameservers,
                expected_nameservers: expectedNs,
                last_checked_at: safeIsoNow()
              }
            };
            saveConnection(updated);
            const pointsGrant = status === "verified"
              ? addPoints({
                  userId: updated.user_id,
                  domain,
                  points: POINTS_NS_VERIFIED,
                  reason: "ns_delegation_verified",
                  idempotencyKey: `ns_verified:${updated.user_id}:${domain}`,
                  metadata: { connection_id: connectionId }
                })
              : { awarded: false, points_awarded: 0, total_points: Number(pointsBalancesByUser.get(updated.user_id) || 0), domain_points: userDomainBalance(updated.user_id, domain) };

            sendJson(res, 200, {
              connection_id: connectionId,
              domain,
              verification_record: {
                type: "TXT",
                name: txtName,
                value: verificationValue
              },
              checks: {
                txt_present: txtPresent,
                delegated,
                nameservers,
                expected_nameservers: expectedNs
              },
              status,
              last_verified_at: updated.last_verified_at,
              points: {
                awarded: pointsGrant.awarded,
                points_awarded: pointsGrant.points_awarded,
                total_points: pointsGrant.total_points,
                domain_points: pointsGrant.domain_points
              }
            });
          })
          .catch((err) => sendJson(res, 500, { error: String(err?.message || err) }));
      });
      return;
    }

    const actionsMatch = pathname.match(/^\/v1\/cloudflare\/connections\/([^/]+)\/actions$/);
    if (req.method === "POST" && actionsMatch) {
      readJson(req, res, (body) => {
        const connectionId = decodeURIComponent(actionsMatch[1]);
        const row = requireConnection(connectionId, res);
        if (!row) return;
        if (!row.zone_id) return sendJson(res, 400, { error: "missing_zone_selection" });
        const domain = normalizeDomain(body?.domain || row.domain);
        if (!domain) return sendJson(res, 400, { error: "missing_domain" });

        const token = readConnectionToken(req, row);
        if (!token) return sendJson(res, 400, { error: "missing_connection_token" });

        const gatewayValue = String(body?.gateway_target || EDGE_CNAME).trim();
        const ns1 = String(body?.ns1 || PROVIDER_NS1).trim().toLowerCase();
        const ns2 = String(body?.ns2 || PROVIDER_NS2).trim().toLowerCase();
        const deployWorker = body?.deploy_worker === true;

        const records = [
          { type: "CNAME", name: domain, value: gatewayValue, ttl: 300, proxied: true },
          { type: "CNAME", name: `www.${domain}`, value: gatewayValue, ttl: 300, proxied: true },
          { type: "TXT", name: `_tolldns-ns.${domain}`, value: `${ns1},${ns2}`, ttl: 300, proxied: false }
        ];

        Promise.all(records.map((record) => upsertDnsRecord(token, row.zone_id, record)))
          .then((appliedRecords) => {
            const actionPoints = addPoints({
              userId: row.user_id,
              domain,
              points: POINTS_DNS_ACTIONS,
              reason: "dns_actions_applied",
              idempotencyKey: `dns_actions:${row.user_id}:${domain}`,
              metadata: { connection_id: connectionId, zone_id: row.zone_id }
            });
            const workerPoints = deployWorker
              ? addPoints({
                  userId: row.user_id,
                  domain,
                  points: POINTS_WORKER_TEMPLATE,
                  reason: "worker_template_requested",
                  idempotencyKey: `worker_template:${row.user_id}:${domain}`,
                  metadata: { connection_id: connectionId, zone_id: row.zone_id }
                })
              : { awarded: false, points_awarded: 0, total_points: actionPoints.total_points, domain_points: actionPoints.domain_points };
            sendJson(res, 200, {
              connection_id: connectionId,
              zone_id: row.zone_id,
              domain,
              nameservers_to_set_at_registrar: [ns1, ns2],
              applied_dns_records: appliedRecords,
              points: {
                actions_awarded: actionPoints.points_awarded,
                worker_awarded: workerPoints.points_awarded,
                total_points: Number(pointsBalancesByUser.get(row.user_id) || 0),
                domain_points: userDomainBalance(row.user_id, domain)
              },
              worker_deployment: deployWorker
                ? {
                    status: "template_ready",
                    script_name: String(body?.worker_script_name || "ddns-gateway-worker").trim(),
                    route_pattern: String(body?.worker_route_pattern || `${domain}/*`).trim(),
                    next_step: "Use Wrangler in your account: wrangler deploy --name <script_name>",
                    script_template: "export default { async fetch(req) { return fetch(req); } };"
                  }
                : null
            });
          })
          .catch((err) => sendJson(res, 400, { error: String(err?.message || err) }));
      });
      return;
    }

    const statusMatch = pathname.match(/^\/v1\/cloudflare\/connections\/([^/]+)\/status$/);
    if (req.method === "GET" && statusMatch) {
      const connectionId = decodeURIComponent(statusMatch[1]);
      const row = requireConnection(connectionId, res);
      if (!row) return;
      return sendJson(res, 200, {
        ...toPublicConnection(row),
        points: pointsBalanceResponse(row.user_id, row.domain || ""),
        verification: row.verification || null
      });
    }

    if (req.method === "POST" && pathname === "/v1/points/install") {
      readJson(req, res, (body) => {
        const connectionId = String(body?.connection_id || "").trim();
        const linked = connectionId ? rowById(connectionId) : null;
        const userId = String(body?.user_id || linked?.user_id || "").trim();
        const domain = normalizeDomain(body?.domain || linked?.domain || "");
        if (!userId) return sendJson(res, 400, { error: "missing_user_id" });
        if (!domain) return sendJson(res, 400, { error: "missing_domain" });
        const installId = String(body?.install_id || "").trim();
        const hostProvider = String(body?.host_provider || "generic-web-host").trim();
        const idempotencyKey = installId
          ? `web_host_install:${userId}:${domain}:${installId}`
          : `web_host_install:${userId}:${domain}`;
        const grant = addPoints({
          userId,
          domain,
          points: POINTS_INSTALL_WEB_HOST,
          reason: "web_host_install",
          idempotencyKey,
          metadata: { host_provider: hostProvider, connection_id: connectionId || null }
        });
        return sendJson(res, 200, {
          user_id: userId,
          domain,
          points_awarded: grant.points_awarded,
          total_points: grant.total_points,
          domain_points: grant.domain_points,
          already_recorded: grant.awarded === false && grant.reason === "duplicate_event",
          reason: "web_host_install"
        });
      });
      return;
    }

    if (req.method === "GET" && pathname === "/v1/points/balance") {
      const userId = String(url.searchParams.get("user_id") || "").trim();
      const domain = String(url.searchParams.get("domain") || "").trim();
      if (!userId) return sendJson(res, 400, { error: "missing_user_id" });
      return sendJson(res, 200, pointsBalanceResponse(userId, domain));
    }

    if (req.method === "GET" && pathname === "/v1/points/events") {
      const userId = String(url.searchParams.get("user_id") || "").trim();
      const domain = normalizeDomain(url.searchParams.get("domain") || "");
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50)));
      if (!userId) return sendJson(res, 400, { error: "missing_user_id" });
      const filtered = pointsEvents
        .filter((evt) => evt.user_id === userId && (!domain || evt.domain === domain))
        .slice(-limit)
        .reverse();
      return sendJson(res, 200, { user_id: userId, domain: domain || null, events: filtered });
    }

    if (req.method === "POST" && pathname === "/v1/sites") {
      readJson(req, res, (body) => {
        const site = buildSitePlan(body);
        return sendJson(res, 200, site);
      });
      return;
    }

    return sendJson(res, 404, { error: "not_found" });
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  createServer().listen(PORT, HOST, () => {
    console.log(`hosting-control-plane listening on ${HOST}:${PORT}`);
  });
}

import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || "8092");
const HOST = process.env.HOST || "0.0.0.0";
const EDGE_CNAME = process.env.HOSTING_EDGE_CNAME || "edge.tolldns.io";
const MAX_BODY_BYTES = 64 * 1024;
const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const CF_OAUTH_AUTHORIZE_URL = "https://dash.cloudflare.com/oauth2/auth";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
// MVP in-memory store; replace with persistent storage before production.
const connections = new Map();
const oauthStates = new Map();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString()
  });
  res.end(body);
}

function normalizeDomain(domain) {
  return typeof domain === "string" ? domain.trim().toLowerCase().replace(/\.+$/, "") : "";
}

function buildTokenRef(token) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return `cf_tok_${hash.slice(0, 16)}`;
}

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

async function cloudflareJson(token, path, init = {}, fetchImpl = globalThis.__cloudflareFetch || globalThis.fetch) {
  const res = await fetchImpl(`${CF_API_BASE}${path}`, {
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

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/healthz") {
      return sendJson(res, 200, { ok: true, edge_provider: "cloudflare" });
    }

    if (req.method === "GET" && pathname === "/connect-cloudflare") {
      const body = `<!doctype html><html><head><meta charset="utf-8"><title>Connect Cloudflare</title></head><body><h1>Connect Cloudflare</h1><p>Choose OAuth (recommended) or paste an API token (MVP).</p><ol><li><a href="/v1/cloudflare/oauth/start">Connect with OAuth</a></li><li>POST JSON to <code>/v1/cloudflare/connect</code> with <code>user_id</code> and <code>api_token</code>.</li></ol></body></html>`;
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": Buffer.byteLength(body).toString()
      });
      res.end(body);
      return;
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
        const now = new Date().toISOString();
        const connectionId = crypto.randomUUID();
        const row = {
          connection_id: connectionId,
          user_id: userId,
          zone_id: null,
          token_ref: buildTokenRef(token),
          created_at: now,
          scopes,
          last_verified_at: null
        };
        connections.set(connectionId, row);
        return sendJson(res, 200, row);
      });
      return;
    }

    if (req.method === "GET" && pathname === "/v1/cloudflare/zones") {
      const token = String(req.headers["x-cloudflare-token"] || "").trim();
      if (!token) return sendJson(res, 400, { error: "missing_api_token" });
      cloudflareJson(token, "/zones?per_page=50")
        .then((payload) => {
          const zones = Array.isArray(payload?.result)
            ? payload.result.map((z) => ({ id: z.id, name: z.name, status: z.status }))
            : [];
          sendJson(res, 200, { zones });
        })
        .catch((err) => sendJson(res, 400, { error: String(err?.message || err) }));
      return;
    }

    const zoneMatch = pathname.match(/^\/v1\/cloudflare\/connections\/([^/]+)\/zone$/);
    if (req.method === "POST" && zoneMatch) {
      readJson(req, res, (body) => {
        const connectionId = decodeURIComponent(zoneMatch[1]);
        const row = connections.get(connectionId);
        if (!row) return sendJson(res, 404, { error: "connection_not_found" });
        const zoneId = String(body?.zone_id || "").trim();
        if (!zoneId) return sendJson(res, 400, { error: "missing_zone_id" });
        const updated = { ...row, zone_id: zoneId };
        connections.set(connectionId, updated);
        return sendJson(res, 200, updated);
      });
      return;
    }

    const verifyMatch = pathname.match(/^\/v1\/cloudflare\/connections\/([^/]+)\/verify-domain$/);
    if (req.method === "POST" && verifyMatch) {
      readJson(req, res, (body) => {
        const connectionId = decodeURIComponent(verifyMatch[1]);
        const row = connections.get(connectionId);
        if (!row) return sendJson(res, 404, { error: "connection_not_found" });
        const domain = normalizeDomain(body?.domain);
        const txtValue = String(body?.txt_value || "").trim() || crypto.randomBytes(16).toString("hex");
        if (!domain) return sendJson(res, 400, { error: "missing_domain" });
        const verified = body?.verified === true;
        const updated = verified ? { ...row, last_verified_at: new Date().toISOString() } : row;
        connections.set(connectionId, updated);
        return sendJson(res, 200, {
          connection_id: connectionId,
          domain,
          verification_record: {
            type: "TXT",
            name: `_ddns-verify.${domain}`,
            value: txtValue
          },
          status: verified ? "verified" : "pending"
        });
      });
      return;
    }

    const actionsMatch = pathname.match(/^\/v1\/cloudflare\/connections\/([^/]+)\/actions$/);
    if (req.method === "POST" && actionsMatch) {
      readJson(req, res, (body) => {
        const connectionId = decodeURIComponent(actionsMatch[1]);
        const row = connections.get(connectionId);
        if (!row) return sendJson(res, 404, { error: "connection_not_found" });
        if (!row.zone_id) return sendJson(res, 400, { error: "missing_zone_selection" });
        const domain = normalizeDomain(body?.domain);
        if (!domain) return sendJson(res, 400, { error: "missing_domain" });
        const nsValue = String(body?.ns_target || "ns1.tolldns.io").trim();
        const gatewayValue = String(body?.gateway_target || EDGE_CNAME).trim();
        const deployWorker = body?.deploy_worker === true;
        return sendJson(res, 200, {
          connection_id: connectionId,
          zone_id: row.zone_id,
          dns_records: [
            { type: "NS", name: `_ddns.${domain}`, value: nsValue, ttl: 300, action: "upsert" },
            { type: "CNAME", name: domain, value: gatewayValue, ttl: 300, proxied: true, action: "upsert" }
          ],
          worker_deployment: deployWorker
            ? {
                status: "template_ready",
                script_name: String(body?.worker_script_name || "ddns-gateway-worker").trim(),
                route_pattern: String(body?.worker_route_pattern || `${domain}/*`).trim(),
                script_template: "export default { async fetch(req) { return fetch(req); } };"
              }
            : null
        });
      });
      return;
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

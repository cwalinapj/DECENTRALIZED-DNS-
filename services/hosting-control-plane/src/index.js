import http from "node:http";

const PORT = Number(process.env.PORT || "8092");
const HOST = process.env.HOST || "0.0.0.0";
const EDGE_CNAME = process.env.HOSTING_EDGE_CNAME || "edge.tolldns.io";
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString()
  });
  res.end(body);
}

function buildSitePlan(body) {
  const domain = typeof body?.domain === "string" ? body.domain.trim().toLowerCase() : "";
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
    if (req.method === "GET" && req.url === "/healthz") {
      return sendJson(res, 200, { ok: true, edge_provider: "cloudflare" });
    }
    if (req.method === "POST" && req.url === "/v1/sites") {
      let raw = "";
      let bytes = 0;
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_BODY_BYTES) {
          req.destroy();
          return sendJson(res, 413, { error: "request_too_large" });
        }
        raw += chunk;
      });
      req.on("end", () => {
        try {
          const body = raw ? JSON.parse(raw) : {};
          const site = buildSitePlan(body);
          return sendJson(res, 200, site);
        } catch (err) {
          return sendJson(res, 400, { error: String(err?.message || err) });
        }
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

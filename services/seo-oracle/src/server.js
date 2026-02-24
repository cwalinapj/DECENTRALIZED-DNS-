import http from "node:http";
import { createStore } from "./store.js";
import { createOracle } from "./oracle.js";
import { validateDomain } from "./domain.js";
import { TokenBucketLimiter, hashIp } from "./rate_limit.js";

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString()
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_json");
  }
}

function requestIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || String(req.socket.remoteAddress || "unknown");
}

export function createServer({ store = createStore(), fetchImpl = fetch } = {}) {
  const oracle = createOracle(store, fetchImpl);
  const limiter = new TokenBucketLimiter(
    Number(process.env.SEO_ORACLE_SCAN_RATE_LIMIT_CAPACITY || "12"),
    Number(process.env.SEO_ORACLE_SCAN_RATE_LIMIT_REFILL_PER_SEC || "0.2")
  );

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const ipHash = hashIp(requestIp(req));

    try {
      if (req.method === "GET" && url.pathname === "/healthz") {
        return json(res, 200, { ok: true, service: "seo-oracle" });
      }

      if (req.method === "POST" && (url.pathname === "/v1/scan" || url.pathname === "/v1/serp/track")) {
        if (!limiter.allow(`scan:${ipHash}`)) {
          store.logAudit({ endpoint: url.pathname, decision: "rate_limited", ip_hash: ipHash });
          return json(res, 429, { error: "rate_limited" });
        }
        const body = await readBody(req);
        const valid = validateDomain(body.domain);
        if (!valid.ok) return json(res, 400, { error: valid.error });

        const kind = url.pathname === "/v1/serp/track" ? "serp_track" : "scan";
        const job = oracle.createJob(valid.domain, kind);
        store.logAudit({ endpoint: url.pathname, decision: "accepted", domain: valid.domain, ip_hash: ipHash });
        setImmediate(() => oracle.runJob(job).catch(() => {}));
        return json(res, 200, { job_id: job.job_id, status: job.status });
      }

      if (req.method === "GET" && url.pathname.startsWith("/v1/scan/")) {
        const jobId = url.pathname.slice("/v1/scan/".length);
        const job = oracle.getJob(jobId);
        if (!job) return json(res, 404, { error: "job_not_found" });
        return json(res, 200, job);
      }

      if (req.method === "GET" && url.pathname.startsWith("/v1/serp/job/")) {
        const jobId = url.pathname.slice("/v1/serp/job/".length);
        const job = oracle.getJob(jobId);
        if (!job) return json(res, 404, { error: "job_not_found" });
        return json(res, 200, job);
      }

      if (req.method === "GET" && url.pathname === "/v1/site/audit") {
        const valid = validateDomain(url.searchParams.get("domain"));
        if (!valid.ok) return json(res, 400, { error: valid.error });
        const refresh = url.searchParams.get("refresh") === "1";
        const result = await oracle.getOrRefresh(valid.domain, refresh);
        return json(res, 200, {
          domain: valid.domain,
          score: result.decision.score,
          tier: result.decision.tier,
          traffic_signal: result.decision.traffic_signal,
          reasons: result.decision.reasons,
          signals: {
            title: result.signals.title,
            h1_count: result.signals.h1s.length,
            keyword_count: result.signals.keywords.length,
            content_length: result.signals.content_length,
            status_code: result.signals.status_code,
            dns_resolves: result.signals.dns_resolves
          },
          updated_at: result.updated_at
        });
      }

      if (req.method === "GET" && url.pathname === "/v1/keywords/suggest") {
        const valid = validateDomain(url.searchParams.get("domain"));
        if (!valid.ok) return json(res, 400, { error: valid.error });
        const result = await oracle.getOrRefresh(valid.domain, false);
        return json(res, 200, {
          domain: valid.domain,
          keywords: result.signals.keywords,
          entities: result.signals.entities,
          updated_at: result.updated_at
        });
      }

      if (req.method === "GET" && url.pathname === "/v1/check") {
        const valid = validateDomain(url.searchParams.get("domain"));
        if (!valid.ok) return json(res, 400, { error: valid.error });
        const refresh = url.searchParams.get("refresh") === "1";
        const result = await oracle.getOrRefresh(valid.domain, refresh);
        return json(res, 200, {
          domain: valid.domain,
          expires_at: result.expires_at,
          traffic_signal: result.decision.traffic_signal,
          treasury_renewal_allowed: result.decision.treasury_renewal_allowed,
          reasons: result.decision.reasons,
          score: result.decision.score,
          tier: result.decision.tier,
          updated_at: result.updated_at
        });
      }

      return json(res, 404, { error: "not_found" });
    } catch (error) {
      const message = String(error?.message || error);
      if (message === "invalid_json") return json(res, 400, { error: "invalid_json" });
      store.logAudit({ endpoint: url.pathname, decision: "error", ip_hash: ipHash, error: message });
      return json(res, 500, { error: "internal_error" });
    }
  });
}

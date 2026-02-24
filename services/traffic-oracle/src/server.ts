import http from "node:http";
import { createJsonlStore } from "./store.js";
import { createOracle } from "./oracle.ts";
import { hashIp, TokenBucketLimiter } from "./rate_limit.ts";
import { validateDomain } from "./validation.ts";

const limiter = new TokenBucketLimiter(
  Number(process.env.TRAFFIC_ORACLE_SCAN_RATE_LIMIT_CAPACITY || "10"),
  Number(process.env.TRAFFIC_ORACLE_SCAN_RATE_LIMIT_REFILL_PER_SEC || "0.2")
);

function json(res: http.ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString()
  });
  res.end(body);
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const size = chunks.reduce((acc, c) => acc + c.length, 0);
    if (size > 128 * 1024) throw new Error("request_too_large");
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid_json");
  }
}

function requestIp(req: http.IncomingMessage): string {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (fwd) return fwd;
  return String(req.socket.remoteAddress || "unknown");
}

export function createServer({ store = createJsonlStore(), fetchImpl = fetch } = {}) {
  const oracle = createOracle(store, fetchImpl);

  return http.createServer(async (req, res) => {
    const ipHash = hashIp(requestIp(req));
    const url = new URL(req.url || "/", "http://localhost");

    try {
      if (req.method === "GET" && url.pathname === "/healthz") {
        return json(res, 200, { ok: true });
      }

      if (req.method === "POST" && url.pathname === "/v1/scan") {
        if (!limiter.allow(`scan:${ipHash}`)) {
          store.logAudit({ endpoint: "/v1/scan", decision: "rate_limited", ip_hash: ipHash });
          return json(res, 429, { error: "rate_limited" });
        }

        const body = await readBody(req);
        const valid = validateDomain(body.domain);
        if (!valid.ok) return json(res, 400, { error: valid.error });

        const job = oracle.createQueuedJob(valid.domain);
        store.logAudit({ endpoint: "/v1/scan", decision: "accepted", domain: valid.domain, ip_hash: ipHash });
        setImmediate(() => {
          oracle.runJob(job).catch(() => {});
        });

        return json(res, 200, { job_id: job.job_id, status: job.status });
      }

      if (req.method === "GET" && url.pathname.startsWith("/v1/scan/")) {
        const jobId = url.pathname.slice("/v1/scan/".length).trim();
        if (!jobId) return json(res, 400, { error: "job_id_required" });
        const job = oracle.getJob(jobId);
        if (!job) return json(res, 404, { error: "job_not_found" });
        return json(res, 200, job);
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
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err);
      if (message === "invalid_json") return json(res, 400, { error: "invalid_json" });
      if (message === "request_too_large") return json(res, 413, { error: "request_too_large" });
      store.logAudit({ endpoint: url.pathname, decision: "error", ip_hash: ipHash, error: message });
      return json(res, 500, { error: "internal_error" });
    }
  });
}

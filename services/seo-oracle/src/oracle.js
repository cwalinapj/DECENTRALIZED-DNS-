import crypto from "node:crypto";
import { collectSignals } from "./fetch_signals.js";
import { scoreSignals } from "./scoring.js";

const CACHE_TTL_MS = Number(process.env.SEO_ORACLE_CACHE_TTL_HOURS || "24") * 3600 * 1000;

export function createOracle(store, fetchImpl = fetch) {
  function fresh(result) {
    if (!result) return false;
    const ts = Date.parse(result.updated_at || "");
    return Number.isFinite(ts) && Date.now() - ts < CACHE_TTL_MS;
  }

  async function compute(domain) {
    const signals = await collectSignals(domain, fetchImpl);
    const decision = scoreSignals(signals);
    const now = new Date();
    const result = {
      domain,
      updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 21 * 24 * 3600 * 1000).toISOString(),
      signals,
      decision
    };
    store.upsertResult(result);
    return result;
  }

  async function getOrRefresh(domain, refresh = false) {
    const existing = store.getLatestResult(domain);
    if (!refresh && fresh(existing)) return existing;
    return compute(domain);
  }

  function createJob(domain, kind = "scan") {
    const job = {
      job_id: crypto.randomBytes(10).toString("hex"),
      kind,
      domain,
      status: "queued",
      created_at: new Date().toISOString()
    };
    store.upsertJob(job);
    return job;
  }

  async function runJob(job) {
    store.upsertJob({ ...job, status: "running", started_at: new Date().toISOString() });
    try {
      const result = await getOrRefresh(job.domain, true);
      const done = {
        ...job,
        status: "done",
        finished_at: new Date().toISOString(),
        result
      };
      store.upsertJob(done);
      return done;
    } catch (error) {
      const failed = {
        ...job,
        status: "failed",
        finished_at: new Date().toISOString(),
        error: String(error?.message || error)
      };
      store.upsertJob(failed);
      return failed;
    }
  }

  return {
    getOrRefresh,
    createJob,
    runJob,
    getJob: (id) => store.getJob(id)
  };
}

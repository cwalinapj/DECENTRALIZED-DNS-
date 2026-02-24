import crypto from "node:crypto";
import { collectSignals } from "./signal_fetcher.ts";
import { scoreSignals } from "./scoring.ts";
import type { OracleStore } from "./store.js";
import type { ScanJob, ScanResult } from "./types.js";

const CACHE_TTL_MS = Number(process.env.TRAFFIC_ORACLE_CACHE_TTL_HOURS || "24") * 3600 * 1000;

export function createOracle(store: OracleStore, fetchImpl: typeof fetch = fetch) {
  async function compute(domain: string): Promise<ScanResult> {
    const signals = await collectSignals(domain, fetchImpl);
    const decision = scoreSignals(signals);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 21 * 24 * 3600 * 1000).toISOString();
    const result: ScanResult = {
      domain,
      updated_at: now.toISOString(),
      expires_at: expiresAt,
      signals,
      decision
    };
    store.upsertResult(result);
    return result;
  }

  function isFresh(result: ScanResult | null): boolean {
    if (!result) return false;
    const ts = Date.parse(result.updated_at);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < CACHE_TTL_MS;
  }

  async function getOrRefresh(domain: string, refresh = false): Promise<ScanResult> {
    const existing = store.getLatestResult(domain);
    if (!refresh && isFresh(existing)) return existing as ScanResult;
    return compute(domain);
  }

  function createQueuedJob(domain: string): ScanJob {
    const job: ScanJob = {
      job_id: crypto.randomBytes(12).toString("hex"),
      domain,
      status: "queued",
      created_at: new Date().toISOString()
    };
    store.upsertJob(job);
    return job;
  }

  async function runJob(job: ScanJob): Promise<ScanJob> {
    const running: ScanJob = { ...job, status: "running", started_at: new Date().toISOString() };
    store.upsertJob(running);
    try {
      const result = await getOrRefresh(job.domain, false);
      const done: ScanJob = {
        ...running,
        status: "done",
        finished_at: new Date().toISOString(),
        result
      };
      store.upsertJob(done);
      return done;
    } catch (err) {
      const failed: ScanJob = {
        ...running,
        status: "failed",
        finished_at: new Date().toISOString(),
        error: String(err instanceof Error ? err.message : err)
      };
      store.upsertJob(failed);
      return failed;
    }
  }

  return {
    createQueuedJob,
    runJob,
    getOrRefresh,
    getJob: (jobId: string) => store.getJob(jobId)
  };
}

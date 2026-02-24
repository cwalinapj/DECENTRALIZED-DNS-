import fs from "node:fs";
import path from "node:path";
import type { ScanJob, ScanResult } from "./types.js";

function ensureParent(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendJsonl(filePath: string, payload: unknown) {
  ensureParent(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function readJsonl(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export type OracleStore = {
  upsertJob: (job: ScanJob) => void;
  getJob: (jobId: string) => ScanJob | null;
  upsertResult: (result: ScanResult) => void;
  getLatestResult: (domain: string) => ScanResult | null;
  logAudit: (event: Record<string, unknown>) => void;
};

export function createJsonlStore(baseDir = path.join(process.cwd(), "services/traffic-oracle/.cache")): OracleStore {
  const jobsPath = path.join(baseDir, "jobs.jsonl");
  const resultsPath = path.join(baseDir, "results.jsonl");
  const auditPath = path.join(baseDir, "audit.log.jsonl");

  function upsertJob(job: ScanJob) {
    appendJsonl(jobsPath, job);
  }

  function getJob(jobId: string): ScanJob | null {
    const entries = readJsonl(jobsPath) as ScanJob[];
    const latest = new Map<string, ScanJob>();
    for (const item of entries) latest.set(item.job_id, item);
    return latest.get(jobId) || null;
  }

  function upsertResult(result: ScanResult) {
    appendJsonl(resultsPath, result);
  }

  function getLatestResult(domain: string): ScanResult | null {
    const entries = readJsonl(resultsPath) as ScanResult[];
    let latest: ScanResult | null = null;
    for (const item of entries) {
      if (String(item.domain || "").toLowerCase() !== domain.toLowerCase()) continue;
      if (!latest || String(item.updated_at) > String(latest.updated_at)) latest = item;
    }
    return latest;
  }

  function logAudit(event: Record<string, unknown>) {
    appendJsonl(auditPath, {
      timestamp: new Date().toISOString(),
      ...event
    });
  }

  return { upsertJob, getJob, upsertResult, getLatestResult, logAudit };
}

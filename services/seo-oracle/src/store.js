import fs from "node:fs";
import path from "node:path";

export function createStore({
  cacheDir = process.env.SEO_ORACLE_CACHE_DIR || path.join(process.cwd(), "services/seo-oracle/.cache")
} = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const jobsPath = path.join(cacheDir, "jobs.jsonl");
  const resultsPath = path.join(cacheDir, "results.jsonl");
  const auditPath = path.join(cacheDir, "audit.log.jsonl");

  const jobs = new Map();
  const latestByDomain = new Map();

  for (const [filePath, isJob] of [[jobsPath, true], [resultsPath, false]]) {
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) continue;
    for (const line of raw.split("\n")) {
      try {
        const obj = JSON.parse(line);
        if (isJob) jobs.set(obj.job_id, obj);
        else latestByDomain.set(obj.domain, obj);
      } catch {
        // keep robust against malformed local lines
      }
    }
  }

  function append(filePath, obj) {
    fs.appendFileSync(filePath, `${JSON.stringify(obj)}\n`, "utf8");
  }

  return {
    upsertJob(job) {
      jobs.set(job.job_id, job);
      append(jobsPath, job);
      return job;
    },
    getJob(jobId) {
      return jobs.get(jobId) || null;
    },
    upsertResult(result) {
      latestByDomain.set(result.domain, result);
      append(resultsPath, result);
      return result;
    },
    getLatestResult(domain) {
      return latestByDomain.get(domain) || null;
    },
    logAudit(entry) {
      const event = { timestamp: new Date().toISOString(), ...entry };
      append(auditPath, event);
    },
    paths: { cacheDir, jobsPath, resultsPath, auditPath }
  };
}

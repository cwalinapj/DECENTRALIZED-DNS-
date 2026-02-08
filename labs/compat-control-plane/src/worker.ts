import { Worker } from "bullmq";
import { Storage } from "./storage.js";
import { runRunner } from "./runner.js";

const redisUrl = process.env.REDIS_URL || "";
if (!redisUrl) {
  console.error("REDIS_URL is required for worker");
  process.exit(1);
}

const store = new Storage(process.env.DATA_DIR || "./data");

const worker = new Worker(
  "compat-jobs",
  async (job) => {
    const jobId = String(job.data?.job_id || "");
    if (!jobId) throw new Error("missing_job_id");
    const stored = store.loadJob(jobId);
    if (!stored) throw new Error("job_missing");
    await runRunner(store, stored);
  },
  { connection: { url: redisUrl } }
);

worker.on("failed", (job, err) => {
  console.error("job_failed", job?.id, err?.message || err);
});

import type { Storage, Job } from "./storage.js";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

function now() { return Math.floor(Date.now() / 1000); }

export async function runRunner(store: Storage, job: Job) {
  const j = store.loadJob(job.id);
  if (!j) return;

  j.state = "running";
  j.started_at = now();
  store.saveJob(j);

  const uploadZip = path.join(store.uploadsDir, `${job.upload_id}.zip`);
  if (!fs.existsSync(uploadZip)) throw new Error("upload_zip_missing");

  const reportDir = path.join(store.reportsDir, job.id);
  fs.mkdirSync(reportDir, { recursive: true });

  const args = [
    "run", "--rm",
    "-v", `${uploadZip}:/in/bundle.zip:ro`,
    "-v", `${reportDir}:/out`,
    "ddns-compat-runner:latest"
  ];

  await new Promise<void>((resolve, reject) => {
    const p = spawn("docker", args, { stdio: "inherit" });
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`runner_exit_${code}`)));
  });

  const reportPath = path.join(reportDir, "report.json");
  const j2 = store.loadJob(job.id);
  if (!j2) return;

  if (!fs.existsSync(reportPath)) {
    j2.state = "failed";
    j2.finished_at = now();
    j2.error = "report_missing";
    store.saveJob(j2);
    return;
  }

  j2.state = "done";
  j2.finished_at = now();
  j2.report_path = reportPath;
  store.saveJob(j2);
}

import fs from "node:fs";
import path from "node:path";
import { buildSite, type SiteModel } from "./build.js";

const dataDir = process.env.DATA_DIR || "./data";
const outputRoot = process.env.OUTPUT_ROOT || "./builds";

export function runBuild(jobId: string) {
  const jobPath = path.join(dataDir, "jobs", `${jobId}.json`);
  if (!fs.existsSync(jobPath)) throw new Error("job_not_found");
  const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
  const sitePath = path.join(dataDir, "sites", `${job.siteId}.json`);
  if (!fs.existsSync(sitePath)) throw new Error("site_not_found");
  const model = JSON.parse(fs.readFileSync(sitePath, "utf8")) as SiteModel;
  const outputDir = path.join(outputRoot, "sites", model.siteId);
  buildSite(model, outputDir);
  return { outputDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jobId = process.argv[2];
  if (!jobId) throw new Error("job_id_required");
  runBuild(jobId);
}

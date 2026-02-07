import { Router, type Request, type Response } from "express";
import type { Storage, Job } from "../storage.js";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

function now() { return Math.floor(Date.now() / 1000); }

export function jobsRouter(store: Storage) {
  const r = Router();

  function requireSite(req: Request) {
    const site_id = String(req.headers["x-ddns-site-id"] || "").trim();
    const token = String(req.headers["x-ddns-site-token"] || "");
    if (!site_id || !token) throw new Error("missing_site_auth");
    const site = store.getSite(site_id);
    if (!site) throw new Error("unknown_site");
    if (site.site_token !== token) throw new Error("bad_token");
    return { site_id };
  }

  r.post("/create", (req: Request, res: Response) => {
    try {
      const { site_id } = requireSite(req);
      const upload_id = String(req.body?.upload_id || "").trim();
      if (!upload_id) return res.status(400).json({ ok: false, error: "upload_id_required" });

      const job_id = crypto.randomBytes(12).toString("hex");
      const job: Job = { id: job_id, site_id, upload_id, state: "queued", created_at: now() };
      store.saveJob(job);

      // Fire-and-forget runner (MVP): run in a child process calling docker
      // Requires docker on the control-plane host.
      runRunner(store, job).catch((e) => {
        const j = store.loadJob(job_id);
        if (!j) return;
        j.state = "failed";
        j.finished_at = now();
        j.error = String(e?.message || e);
        store.saveJob(j);
      });

      return res.json({ ok: true, job });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: String(e?.message || e) });
    }
  });

  r.get("/:id", (req: Request, res: Response) => {
    try {
      requireSite(req);
      const id = String(req.params.id || "").trim();
      const job = store.loadJob(id);
      if (!job) return res.status(404).json({ ok: false, error: "not_found" });
      return res.json({ ok: true, job });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return r;
}

async function runRunner(store: Storage, job: Job) {
  const j = store.loadJob(job.id);
  if (!j) return;

  j.state = "running";
  j.started_at = Math.floor(Date.now() / 1000);
  store.saveJob(j);

  const uploadZip = path.join(store.uploadsDir, `${job.upload_id}.zip`);
  if (!fs.existsSync(uploadZip)) throw new Error("upload_zip_missing");

  const reportDir = path.join(store.reportsDir, job.id);
  fs.mkdirSync(reportDir, { recursive: true });

  // Build/report runner image should already exist in your environment
  // You can later build via CI and pull from registry.
  //
  // Runner reads:
  // - /in/bundle.zip
  // writes:
  // - /out/report.json
  // - /out/screens/*.png
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
    j2.finished_at = Math.floor(Date.now() / 1000);
    j2.error = "report_missing";
    store.saveJob(j2);
    return;
  }

  j2.state = "done";
  j2.finished_at = Math.floor(Date.now() / 1000);
  j2.report_path = reportPath;
  store.saveJob(j2);
}

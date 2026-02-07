import { Router, type Request, type Response } from "express";
import type { Storage, Job } from "../storage.js";
import crypto from "node:crypto";
import { getQueue } from "../queue.js";
import { runRunner } from "../runner.js";

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

  r.post("/create", async (req: Request, res: Response) => {
    try {
      const { site_id } = requireSite(req);
      const upload_id = String(req.body?.upload_id || "").trim();
      if (!upload_id) return res.status(400).json({ ok: false, error: "upload_id_required" });

      const job_id = crypto.randomBytes(12).toString("hex");
      const job: Job = { id: job_id, site_id, upload_id, state: "queued", created_at: now() };
      store.saveJob(job);

      const queue = getQueue();
      if (!queue) {
        return res.status(500).json({ ok: false, error: "redis_required" });
      }
      await queue.add("compat-job", { job_id }, { attempts: 2, backoff: { type: "exponential", delay: 1000 } });

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

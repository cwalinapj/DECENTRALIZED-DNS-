import { Router, type Request, type Response, type NextFunction } from "express";
import type { Storage } from "../storage.js";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";

export function uploadsRouter(store: Storage) {
  const r = Router();
  const upload = multer({ dest: store.uploadsDir });
  const rateWindowMs = Number(process.env.RATE_WINDOW_MS || "60000");
  const rateMax = Number(process.env.RATE_MAX || "20");
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();

  function rateLimit(req: Request, res: Response, next: NextFunction) {
    const site_id = String(req.params.site_id || req.headers["x-ddns-site-id"] || "unknown");
    const key = site_id || String(req.ip || "unknown");
    const now = Date.now();
    if (rateBuckets.size > 1000) {
      for (const [id, entry] of rateBuckets) {
        if (entry.resetAt <= now) rateBuckets.delete(id);
      }
    }
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + rateWindowMs });
      return next();
    }
    if (bucket.count >= rateMax) {
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }
    bucket.count += 1;
    return next();
  }

  r.post("/:site_id", rateLimit, upload.single("bundle"), (req: Request, res: Response) => {
    const site_id = String(req.params.site_id || "").trim();
    const token = String(req.headers["x-ddns-site-token"] || "");

    const site = store.getSite(site_id);
    if (!site) return res.status(404).json({ ok: false, error: "unknown_site" });
    if (!token || token !== site.site_token) return res.status(401).json({ ok: false, error: "bad_token" });

    if (!req.file) return res.status(400).json({ ok: false, error: "missing_bundle" });

    const upload_id = store.newUploadId();
    const finalPath = path.join(store.uploadsDir, `${upload_id}.zip`);

    // move multer temp file to deterministic name
    fs.renameSync(req.file.path, finalPath);

    return res.json({ ok: true, upload_id });
  });

  return r;
}

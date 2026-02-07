import { Router, type Request, type Response } from "express";
import type { Storage } from "../storage.js";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";

export function uploadsRouter(store: Storage) {
  const r = Router();
  const upload = multer({ dest: store.uploadsDir });

  r.post("/:site_id", upload.single("bundle"), (req: Request, res: Response) => {
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

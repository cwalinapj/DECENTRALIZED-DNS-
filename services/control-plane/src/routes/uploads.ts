import { Router } from "express";
import type { Storage } from "../storage.js";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const RATE_LIMIT_CLEANUP_THRESHOLD = 1000;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string) {
  const now = Date.now();
  if (rateLimits.size > RATE_LIMIT_CLEANUP_THRESHOLD) {
    for (const [entryKey, entryValue] of rateLimits) {
      if (entryValue.resetAt <= now) rateLimits.delete(entryKey);
    }
  }
  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

export function uploadsRouter(store: Storage) {
  const r = Router();
  const upload = multer({ dest: store.uploadsDir });

  r.post("/:site_id", upload.single("bundle"), (req, res) => {
    const site_id = String(req.params.site_id || "").trim();
    const token = String(req.headers["x-ddns-site-token"] || "");

    const site = store.getSite(site_id);
    if (!site) return res.status(404).json({ ok: false, error: "unknown_site" });
    if (!token || token !== site.site_token) return res.status(401).json({ ok: false, error: "bad_token" });

    const clientIp = req.socket?.remoteAddress || "unknown";
    const rateKey = `${site_id}:${clientIp}`;
    if (!checkRateLimit(rateKey)) {
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }

    if (!req.file) return res.status(400).json({ ok: false, error: "missing_bundle" });

    const upload_id = store.newUploadId();
    const finalPath = path.join(store.uploadsDir, `${upload_id}.zip`);

    // move multer temp file to deterministic name
    fs.renameSync(req.file.path, finalPath);

    return res.json({ ok: true, upload_id });
  });

  return r;
}

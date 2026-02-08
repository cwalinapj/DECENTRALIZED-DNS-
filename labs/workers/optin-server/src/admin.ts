import type { Request, Response, NextFunction } from "express";
import type { ServerConfig } from "./config.js";
import { Storage } from "./storage.js";
import { validateSiteUpsertBody } from "./validate.js";

export function requireAdmin(cfg: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers["x-ddns-admin-key"];
    if (!key || key !== cfg.adminApiKey) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    next();
  };
}

export function adminUpsertSite(store: Storage) {
  return (req: Request, res: Response) => {
    try {
      const input = validateSiteUpsertBody(req.body);
      const site = store.upsertSite({
        site_id: input.site_id,
        allowed_origins: input.allowed_origins,
        allowed_categories: input.allowed_categories.length ? input.allowed_categories : ["SITE_AVAILABILITY"],
        enabled: input.enabled
      });
      res.json({ ok: true, site });
    } catch (e: any) {
      res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
  };
}

export function adminGetSite(store: Storage) {
  return (req: Request, res: Response) => {
    const site_id = String(req.params.site_id || "").trim();
    const site = store.getSite(site_id);
    if (!site) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, site });
  };
}

export function adminRotateSiteKey(store: Storage) {
  return (req: Request, res: Response) => {
    const site_id = String(req.params.site_id || "").trim();
    const site = store.getSite(site_id);
    if (!site) return res.status(404).json({ ok: false, error: "not_found" });
    // placeholder for future per-site secret rotation
    const out = store.rotateSiteKey(site_id);
    res.json({ ok: true, ...out });
  };
}

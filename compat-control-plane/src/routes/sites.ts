import { Router, type Request, type Response } from "express";
import type { Storage } from "../storage.js";

export function sitesRouter(store: Storage, requireAdmin: any) {
  const r = Router();

  r.post("/register", requireAdmin, (req: Request, res: Response) => {
    const site_id = String(req.body?.site_id || "").trim();
    if (!site_id) return res.status(400).json({ ok: false, error: "site_id_required" });

    const manifest = req.body?.manifest ?? {};
    const site = store.upsertSite(site_id, manifest);
    return res.json({ ok: true, site: { site_id: site.site_id, site_token: site.site_token } });
  });

  return r;
}

import { Router } from "express";

import { requireAdmin } from "./security.js";
import { getSite, rotateSiteKey, upsertSite } from "./storage.js";
import { parseSiteInput } from "./validate.js";

const router = Router();

router.use(requireAdmin);

router.post("/sites", (req, res) => {
  try {
    const input = parseSiteInput(req.body);
    const site = upsertSite(input);
    res.json({ ok: true, site });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ ok: false, error: message });
  }
});

router.get("/sites/:site_id", (req, res) => {
  const site = getSite(req.params.site_id);
  if (!site) {
    res.status(404).json({ ok: false, error: "site_not_found" });
    return;
  }

  res.json({ ok: true, site });
});

router.post("/sites/:site_id/rotate-key", (req, res) => {
  try {
    const siteId = req.params.site_id;
    const site = getSite(siteId);
    if (!site) {
      res.status(404).json({ ok: false, error: "site_not_found" });
      return;
    }

    const siteKey = rotateSiteKey(siteId);
    res.json({ ok: true, site: { ...site, siteKey } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ ok: false, error: message });
  }
});

export default router;

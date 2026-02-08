import express from "express";
import { loadConfig } from "./config.js";
import { Storage } from "./storage.js";
import { RateLimiter, NonceCache } from "./security.js";
import { optinSubmitHandler } from "./optin.js";
import { requireAdmin, adminUpsertSite, adminGetSite, adminRotateSiteKey } from "./admin.js";

// ---- Boot ----
const cfg = loadConfig();
const store = new Storage(cfg.dataDir);
const limiter = new RateLimiter(cfg.rateLimitPerMin);
const nonces = new NonceCache(10000);

const app = express();
app.use(express.json({ limit: "256kb" }));

// ---- CORS middleware (dynamic per site_id) ----
// Browser posts directly here. We only allow origins that match the site's allowlist.
app.use("/v1/optin/submit", (req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  const site_id = (req.body?.site_id ? String(req.body.site_id) : "").trim();

  if (origin && site_id) {
    const site = store.getSite(site_id);
    if (site?.enabled && site.allowed_origins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
    }
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// ---- Public endpoint ----
app.post("/v1/optin/submit", optinSubmitHandler({ cfg, store, limiter, nonces }));

// ---- Admin endpoints ----
app.use("/v1/admin", requireAdmin(cfg));

app.post("/v1/admin/sites", adminUpsertSite(store));
app.get("/v1/admin/sites/:site_id", adminGetSite(store));
app.post("/v1/admin/sites/:site_id/rotate-key", adminRotateSiteKey(store));

// ---- Health ----
app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.listen(cfg.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ddns-optin-server listening on :${cfg.port}`);
});

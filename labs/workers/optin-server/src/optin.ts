import type { Request, Response } from "express";
import type { ServerConfig } from "./config.js";
import { nowSec } from "./config.js";
import { Storage } from "./storage.js";
import { validateOptinBody } from "./validate.js";
import { extractOrigin, isOriginAllowed, enforceSkew, type RateLimiter, type NonceCache } from "./security.js";

export function optinSubmitHandler(deps: {
  cfg: ServerConfig;
  store: Storage;
  limiter: RateLimiter;
  nonces: NonceCache;
}) {
  return (req: Request, res: Response) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!deps.limiter.allow(ip)) {
        return res.status(429).json({ ok: false, error: "rate_limited" });
      }

      const body = validateOptinBody(req.body);

      enforceSkew(body.ts, deps.cfg);

      if (deps.nonces.seen(body.nonce)) {
        return res.status(409).json({ ok: false, error: "replay_detected" });
      }
      deps.nonces.add(body.nonce);

      const site = deps.store.getSite(body.site_id);
      if (!site || !site.enabled) {
        return res.status(404).json({ ok: false, error: "unknown_site" });
      }

      const origin = extractOrigin(req);
      if (!isOriginAllowed(origin, site.allowed_origins)) {
        return res.status(403).json({ ok: false, error: "origin_not_allowed" });
      }

      // Enforce categories are subset of allowed by site config
      const categories = (body.categories && body.categories.length ? body.categories : site.allowed_categories)
        .filter((c) => site.allowed_categories.includes(c));

      const record = {
        kind: "optin",
        received_at: nowSec(),
        ip,
        origin,
        site_id: body.site_id,
        email: body.email || null,
        categories,
        page_url: body.page_url || null,
        client_ts: body.ts,
        nonce: body.nonce
      };

      deps.store.appendOptin(record);

      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
  };
}

import { Router } from "express";

import { config } from "./config.js";
import { addOptin, getSite } from "./storage.js";
import {
  applyCorsHeaders,
  getClientIp,
  NonceStore,
  RateLimiter,
  resolveAllowedOrigin,
  verifySiteKey
} from "./security.js";
import { parseOptinInput } from "./validate.js";

const router = Router();
const nonceStore = new NonceStore(config.nonceTtlSec * 1000);
const rateLimiter = new RateLimiter();
const MILLISECOND_TIMESTAMP_THRESHOLD = 1_000_000_000_000;

const resolveSiteId = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
};

router.options("/submit", (req, res) => {
  const siteId =
    resolveSiteId(req.query.site_id) || resolveSiteId(req.header("x-site-id"));
  if (!siteId) {
    res.status(400).json({ ok: false, error: "site_id_required" });
    return;
  }

  const site = getSite(siteId);
  if (!site) {
    res.status(404).json({ ok: false, error: "site_not_found" });
    return;
  }

  const allowedOrigin = resolveAllowedOrigin(req, site);
  if (!allowedOrigin) {
    res.status(403).json({ ok: false, error: "origin_not_allowed" });
    return;
  }

  applyCorsHeaders(res, allowedOrigin);
  res.status(204).end();
});

router.post("/submit", (req, res) => {
  let input;
  try {
    input = parseOptinInput(req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ ok: false, error: message });
    return;
  }

  const site = getSite(input.siteId);
  if (!site) {
    res.status(404).json({ ok: false, error: "site_not_found" });
    return;
  }

  const allowedOrigin = resolveAllowedOrigin(req, site);
  if (!allowedOrigin) {
    res.status(403).json({ ok: false, error: "origin_not_allowed" });
    return;
  }

  applyCorsHeaders(res, allowedOrigin);

  if (!verifySiteKey(req, site)) {
    res.status(401).json({ ok: false, error: "invalid_site_key" });
    return;
  }

  const clientIp = getClientIp(req);
  const rateConfig = site.rateLimit ?? config.defaultRateLimit;
  const rateKey = `${site.siteId}:${clientIp}`;
  const rateResult = rateLimiter.check(rateKey, rateConfig);
  if (!rateResult.ok) {
    res.setHeader("Retry-After", String(rateResult.retryAfterSec));
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  if (!nonceStore.checkAndStore(site.siteId, input.nonce)) {
    res.status(409).json({ ok: false, error: "nonce_reuse" });
    return;
  }

  const timestamp = input.timestamp ?? Date.now();
  const createdAt = new Date(
    timestamp > MILLISECOND_TIMESTAMP_THRESHOLD ? timestamp : timestamp * 1000
  ).toISOString();

  const record = addOptin({
    siteId: site.siteId,
    createdAt,
    email: input.email,
    consent: input.consent,
    nonce: input.nonce,
    ip: clientIp,
    userAgent: req.header("user-agent") || undefined,
    data: input.data
  });

  res.json({ ok: true, record });
});

export default router;

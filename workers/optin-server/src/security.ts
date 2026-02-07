import crypto from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { config, type RateLimitConfig } from "./config.js";
import type { SiteConfig } from "./storage.js";

const normalizeOrigin = (value: string): string | null => {
  if (value === "null") return "null";
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const isAllowedByList = (origin: string, allowList: string[]): boolean => {
  if (allowList.includes("*")) return true;
  const lowered = origin.toLowerCase();
  return allowList.some((entry) => entry.toLowerCase() === lowered);
};

export const resolveAllowedOrigin = (
  req: Request,
  site: SiteConfig
): string | null => {
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const origin = originHeader ? normalizeOrigin(originHeader) : null;
  const refererOrigin = refererHeader ? normalizeOrigin(refererHeader) : null;

  if (origin) {
    return isAllowedByList(origin, site.allowOrigins) ? origin : null;
  }

  if (refererOrigin) {
    return isAllowedByList(refererOrigin, site.allowReferers) ? refererOrigin : null;
  }

  if (site.allowOrigins.includes("*") || site.allowReferers.includes("*")) {
    return "*";
  }

  return null;
};

export const applyCorsHeaders = (res: Response, origin: string): void => {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Site-Id, X-Site-Key"
  );
  res.setHeader("Access-Control-Max-Age", "600");
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const header = req.header("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const provided = req.header("x-admin-key") || bearer;

  if (!provided || provided !== config.adminKey) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  next();
};

export const generateKey = (): string => {
  return crypto.randomBytes(24).toString("hex");
};

export const getClientIp = (req: Request): string => {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || "unknown";
};

export const verifySiteKey = (req: Request, site: SiteConfig): boolean => {
  const provided = req.header("x-site-key") || (req.body?.site_key as string);
  return Boolean(provided && provided === site.siteKey);
};

export class RateLimiter {
  private hits = new Map<string, number[]>();

  check(key: string, rateLimitConfig: RateLimitConfig): {
    ok: boolean;
    retryAfterSec: number;
  } {
    const now = Date.now();
    const windowMs = rateLimitConfig.windowSec * 1000;
    const bucket = this.hits.get(key) ?? [];
    const fresh = bucket.filter((ts) => now - ts < windowMs);

    if (fresh.length >= rateLimitConfig.max) {
      const retryAfterMs = windowMs - (now - fresh[0]);
      this.hits.set(key, fresh);
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000))
      };
    }

    fresh.push(now);
    this.hits.set(key, fresh);
    return { ok: true, retryAfterSec: 0 };
  }
}

export class NonceStore {
  private store = new Map<string, number>();
  private lastSweep = 0;

  constructor(private ttlMs: number) {}

  checkAndStore(siteId: string, nonce: string): boolean {
    const now = Date.now();
    const key = `${siteId}:${nonce}`;
    if (now - this.lastSweep > this.ttlMs) {
      this.lastSweep = now;
      for (const [entry, seenAt] of this.store.entries()) {
        if (now - seenAt > this.ttlMs) {
          this.store.delete(entry);
        }
      }
    }

    if (this.store.has(key)) return false;

    this.store.set(key, now);
    return true;
  }
}

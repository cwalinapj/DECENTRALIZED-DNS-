import { nowSec, type ServerConfig } from "./config.js";

function normalizeOrigin(o: string): string {
  // keep scheme+host+port
  try {
    const u = new URL(o);
    return `${u.protocol}//${u.host}`;
  } catch {
    return o;
  }
}

export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  const o = normalizeOrigin(origin);
  return allowed.map(normalizeOrigin).includes(o);
}

export function extractOrigin(req: any): string | undefined {
  // Prefer Origin, fallback to Referer
  const origin = req.headers["origin"];
  if (typeof origin === "string" && origin) return origin;

  const ref = req.headers["referer"];
  if (typeof ref === "string" && ref) {
    try {
      const u = new URL(ref);
      return `${u.protocol}//${u.host}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// Basic per-IP per-minute limiter
export class RateLimiter {
  private buckets = new Map<string, { tsMin: number; count: number }>();

  constructor(private perMin: number) {}

  allow(ip: string): boolean {
    const tsMin = Math.floor(nowSec() / 60);
    const cur = this.buckets.get(ip);
    if (!cur || cur.tsMin !== tsMin) {
      this.buckets.set(ip, { tsMin, count: 1 });
      return true;
    }
    if (cur.count >= this.perMin) return false;
    cur.count += 1;
    return true;
  }
}

// Simple nonce replay protection (in-memory)
export class NonceCache {
  private set = new Set<string>();
  private queue: string[] = [];

  constructor(private maxSize: number) {}

  seen(nonce: string): boolean {
    return this.set.has(nonce);
  }

  add(nonce: string) {
    if (this.set.has(nonce)) return;
    this.set.add(nonce);
    this.queue.push(nonce);
    if (this.queue.length > this.maxSize) {
      const old = this.queue.shift();
      if (old) this.set.delete(old);
    }
  }
}

export function enforceSkew(ts: number, cfg: ServerConfig) {
  const delta = Math.abs(nowSec() - ts);
  if (delta > cfg.maxSkewSec) {
    throw new Error(`timestamp skew too large (${delta}s)`);
  }
}

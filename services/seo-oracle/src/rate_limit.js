import crypto from "node:crypto";

export class TokenBucketLimiter {
  constructor(capacity = 12, refillPerSec = 0.2) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.map = new Map();
  }

  allow(key) {
    const now = Date.now();
    const entry = this.map.get(key) || { tokens: this.capacity, ts: now };
    const refill = ((now - entry.ts) / 1000) * this.refillPerSec;
    entry.tokens = Math.min(this.capacity, entry.tokens + refill);
    entry.ts = now;
    if (entry.tokens < 1) {
      this.map.set(key, entry);
      return false;
    }
    entry.tokens -= 1;
    this.map.set(key, entry);
    return true;
  }
}

export function hashIp(ip) {
  return crypto.createHash("sha256").update(String(ip || "unknown")).digest("hex").slice(0, 16);
}

import crypto from "node:crypto";

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export class TokenBucketLimiter {
  private buckets = new Map<string, { tokens: number; lastRefillMs: number }>();

  constructor(
    private capacity: number,
    private refillPerSec: number
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) || { tokens: this.capacity, lastRefillMs: now };
    const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);
    bucket.lastRefillMs = now;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}

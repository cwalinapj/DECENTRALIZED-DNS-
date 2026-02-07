import path from "node:path";

export interface RateLimitConfig {
  windowSec: number;
  max: number;
}

export interface ServerConfig {
  port: number;
  stateDir: string;
  adminKey: string;
  defaultRateLimit: RateLimitConfig;
  nonceTtlSec: number;
}

const readNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const adminKey = process.env.OPTIN_ADMIN_KEY;

if (!adminKey) {
  throw new Error("OPTIN_ADMIN_KEY is required");
}

export const config: ServerConfig = {
  port: readNumber(process.env.OPTIN_PORT, 8787),
  stateDir: process.env.OPTIN_STATE_DIR || path.resolve(process.cwd(), "state"),
  adminKey,
  defaultRateLimit: {
    windowSec: readNumber(process.env.OPTIN_RATE_WINDOW_SEC, 60),
    max: readNumber(process.env.OPTIN_RATE_MAX, 20)
  },
  nonceTtlSec: readNumber(process.env.OPTIN_NONCE_TTL_SEC, 600)
};

export type SiteConfig = {
  site_id: string;
  allowed_origins: string[]; // e.g. ["https://example.com", "https://www.example.com"]
  allowed_categories: string[]; // enum strings
  enabled: boolean;
  created_at: number;
  updated_at: number;
};

export type ServerConfig = {
  port: number;
  adminApiKey: string;
  dataDir: string;
  // basic rate limit: per IP per minute
  rateLimitPerMin: number;
  // max clock skew allowed
  maxSkewSec: number;
};

export function loadConfig(): ServerConfig {
  const port = Number(process.env.PORT || "8787");
  const adminApiKey = process.env.ADMIN_API_KEY || "";
  if (!adminApiKey) throw new Error("ADMIN_API_KEY is required");

  return {
    port,
    adminApiKey,
    dataDir: process.env.DATA_DIR || "/var/lib/ddns-optin",
    rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN || "60"),
    maxSkewSec: Number(process.env.MAX_SKEW_SEC || "600")
  };
}

export const CATEGORY_ENUM = [
  "SITE_AVAILABILITY",
  "DNS_COMPAT",
  "ROUTING_HINTS",
  "SECURITY_HEADERS",
  "PERF_LIGHT"
] as const;

export type Category = typeof CATEGORY_ENUM[number];

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}

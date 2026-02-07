import type { RateLimitConfig } from "./config.js";

const asString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name}_required`);
  }
  return value.trim();
};

const asOptionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("invalid_string");
  return value.trim();
};

const asStringArray = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => asOptionalString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }
  if (typeof value === "string") return [value.trim()];
  throw new Error("invalid_array");
};

const parseRateLimit = (value: unknown): RateLimitConfig | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const windowSec = Number((value as { window_sec?: number }).window_sec);
  const max = Number((value as { max?: number }).max);
  if (!Number.isFinite(windowSec) || !Number.isFinite(max)) {
    throw new Error("invalid_rate_limit");
  }
  if (windowSec <= 0 || max <= 0) {
    throw new Error("invalid_rate_limit");
  }
  return { windowSec, max };
};

export interface SiteConfigInput {
  siteId: string;
  name?: string;
  allowOrigins: string[];
  allowReferers: string[];
  siteKey?: string;
  rateLimit?: RateLimitConfig;
}

export interface OptinInput {
  siteId: string;
  nonce: string;
  consent: boolean;
  email?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
}

export const parseSiteInput = (body: unknown): SiteConfigInput => {
  if (!body || typeof body !== "object") {
    throw new Error("invalid_payload");
  }

  const source = body as {
    site_id?: unknown;
    siteId?: unknown;
    name?: unknown;
    allow_origins?: unknown;
    allowOrigins?: unknown;
    allow_referers?: unknown;
    allowReferers?: unknown;
    rate_limit?: unknown;
    site_key?: unknown;
    siteKey?: unknown;
  };

  return {
    siteId: asString(source.site_id ?? source.siteId, "site_id"),
    name: asOptionalString(source.name),
    allowOrigins: asStringArray(source.allow_origins ?? source.allowOrigins),
    allowReferers: asStringArray(source.allow_referers ?? source.allowReferers),
    siteKey: asOptionalString(source.site_key ?? source.siteKey),
    rateLimit: parseRateLimit(source.rate_limit)
  };
};

export const parseOptinInput = (body: unknown): OptinInput => {
  if (!body || typeof body !== "object") {
    throw new Error("invalid_payload");
  }

  const source = body as {
    site_id?: unknown;
    siteId?: unknown;
    nonce?: unknown;
    consent?: unknown;
    email?: unknown;
    timestamp?: unknown;
    data?: unknown;
    meta?: unknown;
  };

  const consent = source.consent;
  if (typeof consent !== "boolean") {
    throw new Error("consent_required");
  }

  const timestamp = source.timestamp;
  const parsedTimestamp =
    typeof timestamp === "number" && Number.isFinite(timestamp)
      ? timestamp
      : undefined;

  const data =
    source.data && typeof source.data === "object" && !Array.isArray(source.data)
      ? (source.data as Record<string, unknown>)
      : source.meta &&
          typeof source.meta === "object" &&
          !Array.isArray(source.meta)
        ? (source.meta as Record<string, unknown>)
        : undefined;

  return {
    siteId: asString(source.site_id ?? source.siteId, "site_id"),
    nonce: asString(source.nonce, "nonce"),
    consent,
    email: asOptionalString(source.email),
    timestamp: parsedTimestamp,
    data
  };
};

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { config, type RateLimitConfig } from "./config.js";
import { generateKey } from "./security.js";

export interface SiteConfig {
  siteId: string;
  name?: string;
  allowOrigins: string[];
  allowReferers: string[];
  siteKey: string;
  rateLimit?: RateLimitConfig;
}

export interface SiteConfigInput {
  siteId: string;
  name?: string;
  allowOrigins: string[];
  allowReferers: string[];
  siteKey?: string;
  rateLimit?: RateLimitConfig;
}

export interface OptinRecord {
  id: string;
  siteId: string;
  createdAt: string;
  email?: string;
  consent: boolean;
  nonce: string;
  ip: string;
  userAgent?: string;
  data?: Record<string, unknown>;
}

interface StorageState {
  sites: Record<string, SiteConfig>;
  optins: OptinRecord[];
}

const statePath = path.join(config.stateDir, "optin_state.json");

let state: StorageState = {
  sites: {},
  optins: []
};

export function loadState(): void {
  fs.mkdirSync(config.stateDir, { recursive: true });
  if (!fs.existsSync(statePath)) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (parsed && typeof parsed === "object") {
      state = {
        sites: parsed.sites ?? {},
        optins: Array.isArray(parsed.optins) ? parsed.optins : []
      };
    }
  } catch {
    state = { sites: {}, optins: [] };
  }
}

function saveState(): void {
  fs.mkdirSync(config.stateDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function getSite(siteId: string): SiteConfig | null {
  return state.sites[siteId] ?? null;
}

export function upsertSite(input: SiteConfigInput): SiteConfig {
  const existing = state.sites[input.siteId];
  const siteKey = input.siteKey || existing?.siteKey || generateKey();

  const next: SiteConfig = {
    siteId: input.siteId,
    name: input.name,
    allowOrigins: input.allowOrigins,
    allowReferers: input.allowReferers,
    siteKey,
    rateLimit: input.rateLimit
  };

  state.sites[input.siteId] = next;
  saveState();
  return next;
}

export function rotateSiteKey(siteId: string): string {
  const site = state.sites[siteId];
  if (!site) {
    throw new Error("site_not_found");
  }

  site.siteKey = generateKey();
  saveState();
  return site.siteKey;
}

export function addOptin(
  record: Omit<OptinRecord, "id">
): OptinRecord {
  const full: OptinRecord = {
    id: crypto.randomUUID(),
    ...record
  };

  state.optins.push(full);
  saveState();
  return full;
}

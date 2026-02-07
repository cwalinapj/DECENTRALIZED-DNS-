import type { Category } from "./validate";

export type Env = {
  DB: D1Database;
  ADMIN_API_KEY: string; // wrangler secret
  RATE_LIMIT_PER_MIN: string;
  MAX_SKEW_SEC: string;
};

export type SiteRow = {
  site_id: string;
  enabled: number;
  allowed_origins_json: string;
  allowed_categories_json: string;
  created_at: number;
  updated_at: number;
};

export function parseJsonArray(s: string): string[] {
  try {
    const x = JSON.parse(s);
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
}

export async function getSite(env: Env, site_id: string): Promise<SiteRow | null> {
  const r = await env.DB.prepare("SELECT * FROM sites WHERE site_id = ?1").bind(site_id).first<SiteRow>();
  return r || null;
}

export async function upsertSite(env: Env, input: {
  site_id: string;
  allowed_origins: string[];
  allowed_categories: string[];
  enabled: boolean;
}): Promise<SiteRow> {
  const now = Math.floor(Date.now() / 1000);
  const existing = await getSite(env, input.site_id);
  const created = existing?.created_at ?? now;

  await env.DB.prepare(`
    INSERT INTO sites (site_id, enabled, allowed_origins_json, allowed_categories_json, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(site_id) DO UPDATE SET
      enabled=excluded.enabled,
      allowed_origins_json=excluded.allowed_origins_json,
      allowed_categories_json=excluded.allowed_categories_json,
      updated_at=excluded.updated_at
  `)
    .bind(
      input.site_id,
      input.enabled ? 1 : 0,
      JSON.stringify(input.allowed_origins),
      JSON.stringify(input.allowed_categories),
      created,
      now
    )
    .run();

  const row = await getSite(env, input.site_id);
  if (!row) throw new Error("failed to upsert site");
  return row;
}

export async function insertOptin(env: Env, rec: {
  received_at: number;
  site_id: string;
  origin: string | null;
  ip: string | null;
  email: string | null;
  categories: string[];
  page_url: string | null;
  client_ts: number;
  nonce: string;
}) {
  await env.DB.prepare(`
    INSERT INTO optins (received_at, site_id, origin, ip, email, categories_json, page_url, client_ts, nonce)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `)
    .bind(
      rec.received_at,
      rec.site_id,
      rec.origin,
      rec.ip,
      rec.email,
      JSON.stringify(rec.categories),
      rec.page_url,
      rec.client_ts,
      rec.nonce
    )
    .run();
}

export async function nonceSeen(env: Env, nonce: string): Promise<boolean> {
  const r = await env.DB.prepare("SELECT id FROM optins WHERE nonce = ?1 LIMIT 1").bind(nonce).first();
  return !!r;
}

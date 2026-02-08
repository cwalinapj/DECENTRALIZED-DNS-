import { CATEGORY_ENUM, type Category } from "./config.js";

export type OptinSubmitBody = {
  site_id: string;
  email?: string;
  categories?: string[];
  ts: number;
  nonce: string;
  page_url?: string;
};

export function validateOptinBody(x: any): OptinSubmitBody {
  if (!x || typeof x !== "object") throw new Error("body must be object");

  const site_id = String(x.site_id || "").trim();
  if (!site_id) throw new Error("site_id required");

  const ts = Number(x.ts);
  if (!Number.isFinite(ts) || ts <= 0) throw new Error("ts required");

  const nonce = String(x.nonce || "").trim();
  if (!nonce || nonce.length < 8) throw new Error("nonce required");

  const email = x.email ? String(x.email).trim() : undefined;
  const page_url = x.page_url ? String(x.page_url).trim() : undefined;

  const categoriesRaw = Array.isArray(x.categories) ? x.categories.map((c: any) => String(c)) : [];
  const categories = categoriesRaw.filter((c) => (CATEGORY_ENUM as readonly string[]).includes(c));

  return { site_id, email, categories, ts, nonce, page_url };
}

export function validateSiteUpsertBody(x: any) {
  if (!x || typeof x !== "object") throw new Error("body must be object");

  const site_id = String(x.site_id || "").trim();
  if (!site_id) throw new Error("site_id required");

  const allowed_origins = Array.isArray(x.allowed_origins) ? x.allowed_origins.map((o: any) => String(o).trim()).filter(Boolean) : [];
  if (!allowed_origins.length) throw new Error("allowed_origins required");

  const allowed_categories = Array.isArray(x.allowed_categories) ? x.allowed_categories.map((c: any) => String(c)) : [];
  const filtered = allowed_categories.filter((c) => (CATEGORY_ENUM as readonly string[]).includes(c));
  const enabled = x.enabled === undefined ? true : Boolean(x.enabled);

  return { site_id, allowed_origins, allowed_categories: filtered, enabled };
}

import { json } from "./cors";
import type { Env } from "./db";
import { upsertSite, getSite, parseJsonArray } from "./db";
import { requireJson, validateSiteBody } from "./validate";

function requireAdmin(req: Request, env: Env) {
  const key = req.headers.get("x-ddns-admin-key") || "";
  if (!key || key !== env.ADMIN_API_KEY) throw new Error("unauthorized");
}

export async function handleAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  requireAdmin(req, env);

  // POST /v1/admin/sites
  if (req.method === "POST" && url.pathname === "/v1/admin/sites") {
    requireJson(req);
    const body = validateSiteBody(await req.json());
    const row = await upsertSite(env, {
      site_id: body.site_id,
      allowed_origins: body.allowed_origins,
      allowed_categories: body.allowed_categories.length ? body.allowed_categories : ["SITE_AVAILABILITY"],
      enabled: body.enabled
    });

    return json({
      ok: true,
      site: {
        site_id: row.site_id,
        enabled: !!row.enabled,
        allowed_origins: parseJsonArray(row.allowed_origins_json),
        allowed_categories: parseJsonArray(row.allowed_categories_json),
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    });
  }

  // GET /v1/admin/sites/:site_id
  const m = url.pathname.match(/^\/v1\/admin\/sites\/([^\/]+)$/);
  if (req.method === "GET" && m) {
    const site_id = decodeURIComponent(m[1]);
    const row = await getSite(env, site_id);
    if (!row) return json({ ok: false, error: "not_found" }, { status: 404 });

    return json({
      ok: true,
      site: {
        site_id: row.site_id,
        enabled: !!row.enabled,
        allowed_origins: parseJsonArray(row.allowed_origins_json),
        allowed_categories: parseJsonArray(row.allowed_categories_json),
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    });
  }

  return json({ ok: false, error: "not_found" }, { status: 404 });
}

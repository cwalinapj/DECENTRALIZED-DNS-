import { corsHeaders, json, getOrigin } from "./cors";
import type { Env } from "./db";
import { getSite, insertOptin, nonceSeen, parseJsonArray } from "./db";
import { nowSec, requireJson, validateOptinBody, enforceSkew } from "./validate";
import { handleAdmin } from "./admin";

// Basic in-memory per-IP rate limiter (Worker instance-local; good enough for bootstrap)
const buckets = new Map<string, { tsMin: number; count: number }>();

function rateLimitOk(ip: string, perMin: number): boolean {
  const tsMin = Math.floor(nowSec() / 60);
  const cur = buckets.get(ip);
  if (!cur || cur.tsMin !== tsMin) {
    buckets.set(ip, { tsMin, count: 1 });
    return true;
  }
  if (cur.count >= perMin) return false;
  cur.count++;
  return true;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Health
    if (url.pathname === "/healthz") return json({ ok: true });

    // Admin routes
    if (url.pathname.startsWith("/v1/admin/")) {
      try {
        return await handleAdmin(req, env, url);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, { status: 401 });
      }
    }

    // Preflight support for the public endpoint
    if (req.method === "OPTIONS" && url.pathname === "/v1/optin/submit") {
      // We can only set allow-origin once we know site_id; return generic preflight
      // Browser will still proceed to POST; the POST sets exact origin if allowed.
      return new Response("", {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "POST,OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Max-Age": "600"
        }
      });
    }

    // Public opt-in submit
    if (req.method === "POST" && url.pathname === "/v1/optin/submit") {
      try {
        requireJson(req);

        const ip = req.headers.get("cf-connecting-ip") || "unknown";
        const perMin = Number(env.RATE_LIMIT_PER_MIN || "60");
        if (!rateLimitOk(`${ip}`, perMin)) {
          return json({ ok: false, error: "rate_limited" }, { status: 429 });
        }

        const body = validateOptinBody(await req.json());
        enforceSkew(body.ts, Number(env.MAX_SKEW_SEC || "600"));

        const site = await getSite(env, body.site_id);
        if (!site || !site.enabled) return json({ ok: false, error: "unknown_site" }, { status: 404 });

        const origin = getOrigin(req);
        const allowedOrigins = parseJsonArray(site.allowed_origins_json);
        if (!origin || !allowedOrigins.includes(origin)) {
          return json({ ok: false, error: "origin_not_allowed" }, { status: 403 });
        }

        // Replay protection (nonce must be unique)
        if (await nonceSeen(env, body.nonce)) {
          return json({ ok: false, error: "replay_detected" }, { status: 409, headers: corsHeaders(origin) });
        }

        const allowedCategories = parseJsonArray(site.allowed_categories_json);
        const requested = (body.categories && body.categories.length ? body.categories : allowedCategories);
        const categories = requested.filter((c) => allowedCategories.includes(c));

        await insertOptin(env, {
          received_at: nowSec(),
          site_id: body.site_id,
          origin,
          ip,
          email: body.email ? body.email : null,
          categories,
          page_url: body.page_url ? body.page_url : null,
          client_ts: body.ts,
          nonce: body.nonce
        });

        return json({ ok: true }, { headers: corsHeaders(origin) });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, { status: 400 });
      }
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  }
};

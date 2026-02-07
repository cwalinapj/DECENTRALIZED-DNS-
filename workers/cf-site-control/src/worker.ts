interface Env {
  ADMIN_API_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_WORKER_SCRIPT?: string;
  CF_API_TOKEN?: string;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
}

async function requireAdmin(req: Request, env: Env): Promise<void> {
  if (!env.ADMIN_API_KEY) return;
  const key = req.headers.get("x-ddns-admin-key") || "";
  if (key !== env.ADMIN_API_KEY) {
    throw new Error("unauthorized");
  }
}

async function parseJson(req: Request): Promise<Record<string, any>> {
  const text = await req.text();
  if (!text) return {};
  return JSON.parse(text);
}

async function installWorker(req: Request, env: Env): Promise<Response> {
  const body = await parseJson(req);
  const zoneId = String(body.zone_id || "").trim();
  const siteUrl = String(body.site_url || "").trim();
  const token = String(body.cloudflare_token || env.CF_API_TOKEN || "").trim();
  const accountId = String(body.account_id || env.CF_ACCOUNT_ID || "").trim();
  const scriptName = String(body.script_name || env.CF_WORKER_SCRIPT || "").trim();

  if (!zoneId || !token) {
    return json({ ok: false, error: "missing_cloudflare_settings" }, { status: 400 });
  }

  if (!scriptName) {
    return json({ ok: false, error: "missing_worker_script" }, { status: 400 });
  }

  let pattern = String(body.route_pattern || "").trim();
  if (!pattern && siteUrl) {
    try {
      const host = new URL(siteUrl).hostname;
      pattern = `${host}/*`;
    } catch (_) {
      pattern = "";
    }
  }

  if (!pattern) {
    return json({ ok: false, error: "missing_route_pattern" }, { status: 400 });
  }

  const apiUrl = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/workers/routes`;
  const cfRes = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ pattern, script: scriptName })
  });

  const data = await cfRes.json<any>();
  if (!data?.success) {
    return json({ ok: false, error: data?.errors?.[0]?.message || "cloudflare_error" }, { status: 400 });
  }

  return json({ ok: true, route_id: data?.result?.id || null, account_id: accountId });
}

async function registerSite(req: Request): Promise<Response> {
  const body = await parseJson(req);
  return json({ ok: true, site: body });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      return json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/v1/control/install-worker") {
      try {
        await requireAdmin(req, env);
        return await installWorker(req, env);
      } catch (err: any) {
        return json({ ok: false, error: String(err?.message || err) }, { status: 401 });
      }
    }

    if (req.method === "POST" && url.pathname === "/v1/control/register-site") {
      try {
        await requireAdmin(req, env);
        return await registerSite(req);
      } catch (err: any) {
        return json({ ok: false, error: String(err?.message || err) }, { status: 401 });
      }
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  }
};

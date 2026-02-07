import crypto from "node:crypto";

interface Env {
  ADMIN_API_KEY?: string;
  CF_API_TOKEN?: string;
  EMAIL_MX_TARGETS?: string;
  EMAIL_MX_PRIORITY?: string;
}

interface DnsRecordInput {
  type: "MX" | "TXT";
  name: string;
  content: string;
  ttl: number;
  priority?: number;
}

const VERIFY_PREFIX = "_ddns-email";
const TOKEN_PREFIX = "ddns-email-verify=";
const DEFAULT_MX = "mx.ddns-email.net";

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
  if (key !== env.ADMIN_API_KEY) throw new Error("unauthorized");
}

async function parseJson(req: Request): Promise<Record<string, any>> {
  const text = await req.text();
  if (!text) return {};
  return JSON.parse(text);
}

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, "");
}

function guidance(): string[] {
  return [
    "Enable Email Routing for the zone in Cloudflare.",
    "Publish the MX records that point to the routing gateway.",
    "Publish the TXT verification record and wait for validation.",
    "Create forwarding rules for exact recipients or catch-all."
  ];
}

function getMxTargets(env: Env, body: Record<string, any>): string[] {
  const rawTargetText = String(
    body.mx_targets || env.EMAIL_MX_TARGETS || DEFAULT_MX
  );
  const rawTargets = Array.isArray(body.mx_targets)
    ? body.mx_targets
    : rawTargetText.split(",");

  const targets = rawTargets
    .map((target) => String(target).trim())
    .filter(Boolean);
  return targets.length ? targets : [DEFAULT_MX];
}

function getMxPriority(env: Env, body: Record<string, any>): number {
  const raw = String(
    body.mx_priority || env.EMAIL_MX_PRIORITY || "10"
  ).trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function buildDnsRecords(
  domain: string,
  token: string,
  mxTargets: string[],
  mxPriority: number
): DnsRecordInput[] {
  const txtRecord: DnsRecordInput = {
    type: "TXT",
    name: `${VERIFY_PREFIX}.${domain}`,
    content: `${TOKEN_PREFIX}${token}`,
    ttl: 3600
  };

  const mxRecords = mxTargets.map((target, index) => ({
    type: "MX" as const,
    name: domain,
    content: target,
    ttl: 3600,
    priority: mxPriority + index * 10
  }));

  return [txtRecord, ...mxRecords];
}

async function createDnsRecord(
  zoneId: string,
  token: string,
  record: DnsRecordInput
): Promise<Record<string, any>> {
  const zonePath = encodeURIComponent(zoneId);
  const apiUrl = `https://api.cloudflare.com/client/v4/zones/${zonePath}` +
    "/dns_records";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(record)
  });

  const data = await response.json<any>();
  if (!data?.success) {
    return {
      ok: false,
      error: data?.errors?.[0]?.message || "cloudflare_error",
      record
    };
  }

  return { ok: true, record, id: data?.result?.id || null };
}

async function bootstrap(req: Request, env: Env): Promise<Response> {
  const body = await parseJson(req);
  const domain = normalizeDomain(String(body.domain || ""));
  if (!domain) {
    return json({ ok: false, error: "domain_required" }, { status: 400 });
  }

  const manageDns = Boolean(body.manage_dns);
  const zoneId = String(body.zone_id || "").trim();
  const apiToken = String(
    body.cloudflare_token || env.CF_API_TOKEN || ""
  ).trim();

  if (manageDns && (!zoneId || !apiToken)) {
    return json(
      { ok: false, error: "missing_cloudflare_settings" },
      { status: 400 }
    );
  }

  const verificationToken =
    String(body.verification_token || "").trim() ||
    crypto.randomBytes(16).toString("hex");
  const mxTargets = getMxTargets(env, body);
  const mxPriority = getMxPriority(env, body);
  const dnsRecords = buildDnsRecords(
    domain,
    verificationToken,
    mxTargets,
    mxPriority
  );

  let dnsResults: Record<string, any>[] = [];
  if (manageDns) {
    dnsResults = await Promise.all(
      dnsRecords.map((record) => createDnsRecord(zoneId, apiToken, record))
    );
  }

  return json({
    ok: true,
    domain,
    verification: {
      record_name: `${VERIFY_PREFIX}.${domain}`,
      record_value: `${TOKEN_PREFIX}${verificationToken}`,
      token: verificationToken
    },
    mx_targets: mxTargets,
    dns_records: dnsRecords,
    dns_results: manageDns ? dnsResults : undefined,
    guidance: guidance()
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      return json({ ok: true });
    }

    if (url.pathname === "/v1/email-routing/guide") {
      return json({ ok: true, guidance: guidance() });
    }

    const isBootstrap =
      req.method === "POST" && url.pathname === "/v1/email-routing/bootstrap";
    if (isBootstrap) {
      try {
        await requireAdmin(req, env);
        return await bootstrap(req, env);
      } catch (err: any) {
        return json(
          { ok: false, error: String(err?.message || err) },
          { status: 401 }
        );
      }
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  }
};

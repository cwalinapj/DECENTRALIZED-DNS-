import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/index.js";

async function makeRequest(server, method, path, body, headers = {}) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  return res;
}

async function startServer() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("POST /v1/sites returns cloudflare DNS and TLS status", async () => {
  const server = await startServer();
  try {
    const res = await makeRequest(server, "POST", "/v1/sites", {
      domain: "example.com",
      origin_url: "https://origin.example.com"
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.edge_provider, "cloudflare");
    assert.equal(body.dns_records[0].type, "CNAME");
    assert.equal(body.tls_status.status, "pending_validation");
  } finally {
    server.close();
  }
});

test("POST /v1/sites validates mutually exclusive source inputs", async () => {
  const server = await startServer();
  try {
    const res = await makeRequest(server, "POST", "/v1/sites", {
      domain: "example.com",
      origin_url: "https://origin.example.com",
      static_dir: "./public"
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /provide_exactly_one_origin_url_or_static_dir/);
  } finally {
    server.close();
  }
});

test("GET /connect-cloudflare serves connect page with OAuth and API token paths", async () => {
  const server = await startServer();
  try {
    const res = await makeRequest(server, "GET", "/connect-cloudflare");
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /Connect Cloudflare/i);
    assert.match(body, /Path A: OAuth/i);
    assert.match(body, /Path B: API Token/i);
  } finally {
    server.close();
  }
});

test("GET /v1/cloudflare/oauth/start returns authorization URL with random state", async () => {
  const originalClientId = process.env.CF_OAUTH_CLIENT_ID;
  const originalRedirectUri = process.env.CF_OAUTH_REDIRECT_URI;
  process.env.CF_OAUTH_CLIENT_ID = "cf-client";
  process.env.CF_OAUTH_REDIRECT_URI = "https://example.com/callback";
  const server = await startServer();
  try {
    const res = await makeRequest(server, "GET", "/v1/cloudflare/oauth/start?user_id=user-1");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.state, "string");
    assert.match(body.authorization_url, /state=/);
    assert.match(body.authorization_url, /client_id=cf-client/);
  } finally {
    process.env.CF_OAUTH_CLIENT_ID = originalClientId;
    process.env.CF_OAUTH_REDIRECT_URI = originalRedirectUri;
    server.close();
  }
});

test("Cloudflare connect stores required fields and connection zones use stored token", async () => {
  const server = await startServer();
  const originalFetch = globalThis.__cloudflareFetch;
  let seenAuth = "";
  globalThis.__cloudflareFetch = async (_url, init = {}) => {
    seenAuth = String(init.headers?.Authorization || "");
    return jsonResponse({
      success: true,
      result: [{ id: "zone-1", name: "example.com", status: "active" }]
    });
  };
  try {
    const connectRes = await makeRequest(server, "POST", "/v1/cloudflare/connect", {
      user_id: "user-123",
      api_token: "cf-token-secret",
      scopes: ["Zone:Read", "DNS:Edit"]
    });
    assert.equal(connectRes.status, 200);
    const connectBody = await connectRes.json();
    assert.equal(connectBody.user_id, "user-123");
    assert.equal(connectBody.zone_id, null);
    assert.ok(connectBody.token_ref.startsWith("cf_tok_"));
    assert.equal(typeof connectBody.created_at, "string");
    assert.equal(connectBody.last_verified_at, null);

    const zonesRes = await makeRequest(
      server,
      "GET",
      `/v1/cloudflare/connections/${connectBody.connection_id}/zones`
    );
    assert.equal(zonesRes.status, 200);
    const zonesBody = await zonesRes.json();
    assert.equal(zonesBody.zones[0].id, "zone-1");
    assert.equal(seenAuth, "Bearer cf-token-secret");
  } finally {
    globalThis.__cloudflareFetch = originalFetch;
    server.close();
  }
});

test("verify-domain returns pending without TXT and delegation, then verified once both exist", async () => {
  const server = await startServer();
  const originalResolveTxt = globalThis.__dnsResolveTxt;
  const originalResolveNs = globalThis.__dnsResolveNs;
  let challengeToken = "";

  try {
    globalThis.__dnsResolveTxt = async () => [];
    globalThis.__dnsResolveNs = async () => ["ns9.example.net"];

    const connectRes = await makeRequest(server, "POST", "/v1/cloudflare/connect", {
      user_id: "user-abc",
      api_token: "cf-token-abc"
    });
    const connectBody = await connectRes.json();

    const firstVerify = await makeRequest(
      server,
      "POST",
      `/v1/cloudflare/connections/${connectBody.connection_id}/verify-domain`,
      { domain: "Example.COM." }
    );
    assert.equal(firstVerify.status, 200);
    const firstBody = await firstVerify.json();
    assert.equal(firstBody.status, "pending_verification");
    assert.equal(firstBody.checks.txt_present, false);
    assert.equal(firstBody.checks.delegated, false);
    challengeToken = firstBody.verification_record.value;

    globalThis.__dnsResolveTxt = async () => [[challengeToken]];
    globalThis.__dnsResolveNs = async () => ["ns1.tahoecarspa.com.", "ns2.tahoecarspa.com."];

    const secondVerify = await makeRequest(
      server,
      "POST",
      `/v1/cloudflare/connections/${connectBody.connection_id}/verify-domain`,
      { domain: "example.com" }
    );
    assert.equal(secondVerify.status, 200);
    const secondBody = await secondVerify.json();
    assert.equal(secondBody.status, "verified");
    assert.equal(secondBody.checks.txt_present, true);
    assert.equal(secondBody.checks.delegated, true);
    assert.equal(typeof secondBody.last_verified_at, "string");
    assert.equal(typeof secondBody.points.total_points, "number");
  } finally {
    globalThis.__dnsResolveTxt = originalResolveTxt;
    globalThis.__dnsResolveNs = originalResolveNs;
    server.close();
  }
});

test("actions endpoint upserts DNS records and returns optional worker template", async () => {
  const server = await startServer();
  const originalFetch = globalThis.__cloudflareFetch;
  const calls = [];

  globalThis.__cloudflareFetch = async (url, init = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    const u = new URL(url);
    calls.push({ method, path: u.pathname, query: u.search });

    if (method === "GET" && u.pathname.endsWith("/dns_records")) {
      return jsonResponse({ success: true, result: [] });
    }
    if (method === "POST" && u.pathname.endsWith("/dns_records")) {
      return jsonResponse({ success: true, result: { id: `rec_${calls.length}` } });
    }
    if (method === "PUT" && /\/dns_records\//.test(u.pathname)) {
      return jsonResponse({ success: true, result: { id: "rec_existing" } });
    }
    if (method === "GET" && u.pathname === "/client/v4/zones") {
      return jsonResponse({ success: true, result: [{ id: "zone-1", name: "example.com", status: "active" }] });
    }
    return jsonResponse({ success: true, result: [] });
  };

  try {
    const connectRes = await makeRequest(server, "POST", "/v1/cloudflare/connect", {
      user_id: "user-123",
      api_token: "cf-token-secret"
    });
    const connectBody = await connectRes.json();

    const zoneRes = await makeRequest(
      server,
      "POST",
      `/v1/cloudflare/connections/${connectBody.connection_id}/zone`,
      { zone_id: "zone_abc123", zone_name: "example.com" }
    );
    assert.equal(zoneRes.status, 200);

    const actionsRes = await makeRequest(
      server,
      "POST",
      `/v1/cloudflare/connections/${connectBody.connection_id}/actions`,
      { domain: "example.com", deploy_worker: true }
    );
    assert.equal(actionsRes.status, 200);
    const actionsBody = await actionsRes.json();
    assert.equal(actionsBody.zone_id, "zone_abc123");
    assert.equal(actionsBody.applied_dns_records.length, 3);
    assert.equal(actionsBody.worker_deployment.status, "template_ready");
    assert.equal(actionsBody.nameservers_to_set_at_registrar[0], "ns1.tahoecarspa.com");
    assert.equal(typeof actionsBody.points.total_points, "number");

    const postCalls = calls.filter((c) => c.method === "POST" && c.path.endsWith("/dns_records"));
    assert.equal(postCalls.length, 3);
  } finally {
    globalThis.__cloudflareFetch = originalFetch;
    server.close();
  }
});

test("points install endpoint awards once, then returns duplicate with same idempotency key", async () => {
  const server = await startServer();
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const userId = `points-user-${unique}`;
  const domain = `points-${unique}.example`;
  try {
    const first = await makeRequest(server, "POST", "/v1/points/install", {
      user_id: userId,
      domain,
      host_provider: "cpanel",
      install_id: "install-1"
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.points_awarded > 0, true);
    assert.equal(firstBody.already_recorded, false);

    const second = await makeRequest(server, "POST", "/v1/points/install", {
      user_id: userId,
      domain,
      host_provider: "cpanel",
      install_id: "install-1"
    });
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.points_awarded, 0);
    assert.equal(secondBody.already_recorded, true);

    const balance = await makeRequest(server, "GET", `/v1/points/balance?user_id=${encodeURIComponent(userId)}&domain=${encodeURIComponent(domain)}`);
    assert.equal(balance.status, 200);
    const balanceBody = await balance.json();
    assert.equal(balanceBody.total_points > 0, true);
    assert.equal(balanceBody.domain_points > 0, true);

    const events = await makeRequest(server, "GET", `/v1/points/events?user_id=${encodeURIComponent(userId)}&domain=${encodeURIComponent(domain)}&limit=10`);
    assert.equal(events.status, 200);
    const eventsBody = await events.json();
    assert.equal(Array.isArray(eventsBody.events), true);
    assert.equal(eventsBody.events.length >= 1, true);
    assert.equal(eventsBody.events[0].reason, "web_host_install");
  } finally {
    server.close();
  }
});

test("verify-domain rejects empty normalized domain", async () => {
  const server = await startServer();
  try {
    const connectRes = await makeRequest(server, "POST", "/v1/cloudflare/connect", {
      user_id: "user-123",
      api_token: "cf-token-secret"
    });
    const connectBody = await connectRes.json();
    const verifyRes = await makeRequest(
      server,
      "POST",
      `/v1/cloudflare/connections/${connectBody.connection_id}/verify-domain`,
      { domain: "...." }
    );
    assert.equal(verifyRes.status, 400);
    const verifyBody = await verifyRes.json();
    assert.match(verifyBody.error, /missing_domain/);
  } finally {
    server.close();
  }
});

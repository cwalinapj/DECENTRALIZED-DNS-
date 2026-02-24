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

test("POST /v1/sites returns 400 for missing domain", async () => {
  const server = await startServer();
  try {
    const res = await makeRequest(server, "POST", "/v1/sites", {
      origin_url: "https://origin.example.com"
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /missing_domain/);
  } finally {
    server.close();
  }
});

test("POST /v1/sites accepts static_dir source", async () => {
  const server = await startServer();
  try {
    const res = await makeRequest(server, "POST", "/v1/sites", {
      domain: "static.example.com",
      static_dir: "./public"
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.domain, "static.example.com");
    assert.deepEqual(body.source, { static_dir: "./public" });
    assert.equal(body.edge_provider, "cloudflare");
  } finally {
    server.close();
  }
});

test("GET /healthz returns ok", async () => {
  const server = await startServer();
  try {
    const res = await makeRequest(server, "GET", "/healthz");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
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
    assert.match(body, /OAuth/i);
    assert.match(body, /api token/i);
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
    assert.notEqual(body.state, "user-1");
    assert.match(body.authorization_url, /state=/);
  } finally {
    process.env.CF_OAUTH_CLIENT_ID = originalClientId;
    process.env.CF_OAUTH_REDIRECT_URI = originalRedirectUri;
    server.close();
  }
});

test("Cloudflare connect flow stores required fields and supports zone/verify/actions", async () => {
  const server = await startServer();
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

    const zoneRes = await makeRequest(
      server,
      "POST",
      `/v1/cloudflare/connections/${connectBody.connection_id}/zone`,
      { zone_id: "zone_abc123" }
    );
    assert.equal(zoneRes.status, 200);
    const zoneBody = await zoneRes.json();
    assert.equal(zoneBody.zone_id, "zone_abc123");

    const verifyRes = await makeRequest(
      server,
      "POST",
      `/v1/cloudflare/connections/${connectBody.connection_id}/verify-domain`,
      { domain: "Example.COM.", verified: true }
    );
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json();
    assert.equal(verifyBody.domain, "example.com");
    assert.equal(verifyBody.verification_record.type, "TXT");
    assert.equal(verifyBody.verification_record.value.length, 32);
    assert.equal(verifyBody.status, "verified");

    const actionsRes = await makeRequest(
      server,
      "POST",
      `/v1/cloudflare/connections/${connectBody.connection_id}/actions`,
      { domain: "example.com", deploy_worker: true }
    );
    assert.equal(actionsRes.status, 200);
    const actionsBody = await actionsRes.json();
    assert.equal(actionsBody.zone_id, "zone_abc123");
    assert.equal(actionsBody.dns_records.length, 2);
    assert.equal(actionsBody.dns_records[0].name, "_ddns.example.com");
    assert.equal(actionsBody.worker_deployment.status, "template_ready");
  } finally {
    server.close();
  }
});

test("GET /v1/cloudflare/zones lists zones from Cloudflare API", async () => {
  const server = await startServer();
  const originalFetch = globalThis.__cloudflareFetch;
  globalThis.__cloudflareFetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        result: [{ id: "z1", name: "example.com", status: "active" }]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  try {
    const res = await makeRequest(server, "GET", "/v1/cloudflare/zones", undefined, {
      "x-cloudflare-token": "test-token"
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.zones, [{ id: "z1", name: "example.com", status: "active" }]);
  } finally {
    globalThis.__cloudflareFetch = originalFetch;
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

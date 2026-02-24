import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "../src/index.js";

async function makeRequest(server, method, path, body) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return res;
}

async function startServer() {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "hosting-cp-test-"));
  process.env.HOSTING_CONTROL_CACHE_DIR = cacheDir;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, cacheDir };
}

test("POST /v1/sites returns cloudflare DNS and TLS status", async () => {
  const { server, cacheDir } = await startServer();
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
    fs.rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.HOSTING_CONTROL_CACHE_DIR;
  }
});

test("POST /v1/sites validates mutually exclusive source inputs", async () => {
  const { server, cacheDir } = await startServer();
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
    fs.rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.HOSTING_CONTROL_CACHE_DIR;
  }
});

test("POST /v1/sites returns 400 for missing domain", async () => {
  const { server, cacheDir } = await startServer();
  try {
    const res = await makeRequest(server, "POST", "/v1/sites", {
      origin_url: "https://origin.example.com"
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /missing_domain/);
  } finally {
    server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.HOSTING_CONTROL_CACHE_DIR;
  }
});

test("POST /v1/sites accepts static_dir source", async () => {
  const { server, cacheDir } = await startServer();
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
    fs.rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.HOSTING_CONTROL_CACHE_DIR;
  }
});

test("GET /healthz returns ok", async () => {
  const { server, cacheDir } = await startServer();
  try {
    const res = await makeRequest(server, "GET", "/healthz");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  } finally {
    server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.HOSTING_CONTROL_CACHE_DIR;
  }
});

test("POST /v1/deploy/hook logs stub deploy event", async () => {
  const { server, cacheDir } = await startServer();
  try {
    const res = await makeRequest(server, "POST", "/v1/deploy/hook", {
      sha: "abc123",
      pr_url: "https://github.com/example/repo/pull/1",
      environment: "pi",
      trigger: "autopilot"
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, "queued_stub");
    const logPath = path.join(cacheDir, "deploy-hook.jsonl");
    const log = fs.readFileSync(logPath, "utf8");
    assert.match(log, /\"sha\":\"abc123\"/);
    assert.match(log, /\"status\":\"queued_stub\"/);
  } finally {
    server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.HOSTING_CONTROL_CACHE_DIR;
  }
});

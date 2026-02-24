import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "../src/server.js";
import { createStore } from "../src/store.js";

function fakeHtml(domain) {
  return `<html><head><title>${domain} Trusted Car Spa Services</title></head><body><h1>Premium Auto Detailing</h1><p>ceramic coating paint protection interior detailing appointment service</p></body></html>`;
}

function createFetchStub() {
  return async (url) => {
    const host = new URL(url).hostname;
    return new Response(fakeHtml(host), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  };
}

async function startServer() {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "seo-oracle-test-"));
  const store = createStore({ cacheDir });
  const server = createServer({ store, fetchImpl: createFetchStub() });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, cacheDir };
}

async function req(server, method, pathname, body) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return res;
}

test("healthz and compatibility check endpoints return expected payload", async () => {
  const { server, cacheDir } = await startServer();
  try {
    const h = await req(server, "GET", "/healthz");
    assert.equal(h.status, 200);
    const hb = await h.json();
    assert.equal(hb.ok, true);

    const check = await req(server, "GET", "/v1/check?domain=example.com");
    assert.equal(check.status, 200);
    const body = await check.json();
    assert.equal(body.domain, "example.com");
    assert.ok(["Gold", "Silver", "Bronze", "Verify-only"].includes(body.tier));
    assert.ok(["real", "low", "none"].includes(body.traffic_signal));
    assert.equal(typeof body.treasury_renewal_allowed, "boolean");
  } finally {
    server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("scan + serp jobs enqueue and resolve via job endpoints", async () => {
  const { server, cacheDir } = await startServer();
  try {
    const scan = await req(server, "POST", "/v1/scan", { domain: "example.com" });
    assert.equal(scan.status, 200);
    const scanBody = await scan.json();
    assert.equal(scanBody.status, "queued");

    await new Promise((r) => setTimeout(r, 50));
    const scanJob = await req(server, "GET", `/v1/scan/${scanBody.job_id}`);
    assert.equal(scanJob.status, 200);
    const scanJobBody = await scanJob.json();
    assert.equal(scanJobBody.status, "done");
    assert.equal(scanJobBody.result.domain, "example.com");

    const serp = await req(server, "POST", "/v1/serp/track", { domain: "example.com" });
    assert.equal(serp.status, 200);
    const serpBody = await serp.json();
    await new Promise((r) => setTimeout(r, 50));
    const serpJob = await req(server, "GET", `/v1/serp/job/${serpBody.job_id}`);
    assert.equal(serpJob.status, 200);
    const serpJobBody = await serpJob.json();
    assert.equal(serpJobBody.kind, "serp_track");
    assert.equal(serpJobBody.status, "done");
  } finally {
    server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("keywords endpoint returns extracted suggestions", async () => {
  const { server, cacheDir } = await startServer();
  try {
    const res = await req(server, "GET", "/v1/keywords/suggest?domain=example.com");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.domain, "example.com");
    assert.ok(Array.isArray(body.keywords));
    assert.ok(body.keywords.length > 0);
  } finally {
    server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

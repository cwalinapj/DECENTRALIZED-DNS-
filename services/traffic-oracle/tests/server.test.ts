import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createServer } from "../src/server.ts";
import { createJsonlStore } from "../src/store.ts";

function fakeFetch(html: string, status = 200): typeof fetch {
  return (async () => new Response(html, { status })) as unknown as typeof fetch;
}

async function start(fetchImpl: typeof fetch, baseDir: string) {
  const store = createJsonlStore(baseDir);
  const server = createServer({ store, fetchImpl });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("address_missing");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function jsonReq(baseUrl: string, method: string, route: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await res.json();
  return { status: res.status, body: payload };
}

test("/healthz and /v1/check return compat payload", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "traffic-oracle-"));
  const { server, baseUrl } = await start(fakeFetch("<html><title>Example</title><h1>Main Service</h1></html>"), temp);
  try {
    const health = await jsonReq(baseUrl, "GET", "/healthz");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);

    const check = await jsonReq(baseUrl, "GET", "/v1/check?domain=example.com");
    assert.equal(check.status, 200);
    assert.equal(check.body.domain, "example.com");
    assert.equal(typeof check.body.score, "number");
    assert.equal(typeof check.body.tier, "string");
    assert.equal(["real", "low", "none"].includes(check.body.traffic_signal), true);
    assert.equal(typeof check.body.treasury_renewal_allowed, "boolean");
    assert.equal(Array.isArray(check.body.reasons), true);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("/v1/scan enqueues and /v1/scan/:id resolves done", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "traffic-oracle-"));
  const { server, baseUrl } = await start(fakeFetch("<html><title>Scan Test</title><h1>H1</h1></html>"), temp);
  try {
    const queued = await jsonReq(baseUrl, "POST", "/v1/scan", { domain: "example.com" });
    assert.equal(queued.status, 200);
    assert.equal(typeof queued.body.job_id, "string");

    let latest = await jsonReq(baseUrl, "GET", `/v1/scan/${queued.body.job_id}`);
    for (let i = 0; i < 20 && latest.body.status !== "done"; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      latest = await jsonReq(baseUrl, "GET", `/v1/scan/${queued.body.job_id}`);
    }

    assert.equal(latest.status, 200);
    assert.equal(latest.body.status, "done");
    assert.equal(latest.body.result.domain, "example.com");
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("cache works for /v1/check unless refresh=1", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "traffic-oracle-"));
  let html = "<html><title>First</title><h1>First</h1></html>";
  const fetchImpl = (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
  const { server, baseUrl } = await start(fetchImpl, temp);

  try {
    const first = await jsonReq(baseUrl, "GET", "/v1/check?domain=example.com");
    html = "<html><title>Second</title><h1>Second</h1></html>";

    const cached = await jsonReq(baseUrl, "GET", "/v1/check?domain=example.com");
    assert.equal(cached.status, 200);
    assert.equal(cached.body.updated_at, first.body.updated_at);

    const refreshed = await jsonReq(baseUrl, "GET", "/v1/check?domain=example.com&refresh=1");
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.updated_at, first.body.updated_at);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

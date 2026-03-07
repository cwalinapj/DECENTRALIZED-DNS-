import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function runScript(args = [], env = {}) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["scripts/zone_manager.sh", ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ status: code ?? 1, stdout, stderr });
    });
  });
}

function startMockPdns() {
  const state = {
    zoneName: "example.com.",
    rrsets: []
  };

  const server = http.createServer((req, res) => {
    if (req.headers["x-api-key"] !== "test-key") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const expected = `/api/v1/servers/localhost/zones/${state.zoneName}`;
    if (pathname !== expected) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", pathname }));
      return;
    }

    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: state.zoneName,
          name: state.zoneName,
          rrsets: state.rrsets
        })
      );
      return;
    }

    if (req.method !== "PATCH") {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }

    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const payload = raw ? JSON.parse(raw) : {};
      for (const change of payload.rrsets || []) {
        const idx = state.rrsets.findIndex((r) => r.name === change.name && r.type === change.type);
        if (change.changetype === "DELETE") {
          if (idx >= 0) state.rrsets.splice(idx, 1);
          continue;
        }
        const next = {
          name: change.name,
          type: change.type,
          ttl: change.ttl ?? 300,
          records: Array.isArray(change.records) ? change.records : []
        };
        if (idx >= 0) state.rrsets[idx] = next;
        else state.rrsets.push(next);
      }

      res.writeHead(204);
      res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        stop: () => new Promise((done) => server.close(() => done())),
        apiUrl: `http://127.0.0.1:${addr.port}`
      });
    });
    server.once("error", reject);
  });
}

test("pdns backend set/resolve/delete round trip", async () => {
  const pdns = await startMockPdns();
  try {
    const baseEnv = {
      ZONE_BACKEND: "pdns",
      PDNS_API_URL: pdns.apiUrl,
      PDNS_SERVER_ID: "localhost",
      PDNS_ZONE: "example.com",
      PDNS_API_KEY: "test-key"
    };

    const setRes = await runScript([
      "set",
      "--name",
      "www.example.com",
      "--type",
      "CNAME",
      "--value",
      "example.com",
      "--ttl",
      "120"
    ], baseEnv);
    assert.equal(setRes.status, 0, setRes.stderr || setRes.stdout);
    assert.match(setRes.stdout, /"name":\s*"www\.example\.com\."/);
    assert.match(setRes.stdout, /"type":\s*"CNAME"/);

    const resolveRes = await runScript([
      "resolve",
      "--name",
      "www.example.com",
      "--type",
      "CNAME"
    ], baseEnv);
    assert.equal(resolveRes.status, 0, resolveRes.stderr || resolveRes.stdout);
    assert.match(resolveRes.stdout, /"content":\s*"example\.com\."/);

    const deleteRes = await runScript([
      "delete",
      "--name",
      "www.example.com",
      "--type",
      "CNAME",
      "--value",
      "example.com"
    ], baseEnv);
    assert.equal(deleteRes.status, 0, deleteRes.stderr || deleteRes.stdout);

    const listRes = await runScript(["list", "--name", "www.example.com"], baseEnv);
    assert.equal(listRes.status, 0, listRes.stderr || listRes.stdout);
    assert.equal(listRes.stdout.trim(), "");
  } finally {
    await pdns.stop();
  }
});

test("pdns backend requires PDNS env vars", async () => {
  const res = await runScript([
    "set",
    "--name",
    "example.com",
    "--type",
    "A",
    "--value",
    "198.51.100.42"
  ], {
    ZONE_BACKEND: "pdns",
    PDNS_API_URL: "http://127.0.0.1:65535"
  });

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /PDNS_API_KEY and PDNS_ZONE are required/);
});

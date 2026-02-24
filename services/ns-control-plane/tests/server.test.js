import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "../src/server.js";
import { createStore } from "../src/store.js";

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ns-control-test-"));
  return createStore(path.join(dir, "state.json"));
}

async function withServer(handler, deps = {}) {
  const server = createServer({
    store: tempStore(),
    providerNs: ["ns1.tahoecarspa.com", "ns2.tahoecarspa.com"],
    dnsChecks: {
      async checkTxt() {
        return false;
      },
      async getNameservers() {
        return [];
      }
    },
    pdns: {
      async ensureZone() {
        return { created: true };
      },
      async bumpSerial() {
        return { bumped: true };
      },
      async listRecords() {
        return [];
      },
      async addRecord() {
        return { ok: true };
      },
      async deleteRecord() {
        return { ok: true };
      }
    },
    ...deps
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await handler(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("POST /v1/domains creates onboarding token", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/v1/domains`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: "Example.com" })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.domain, "example.com");
    assert.equal(body.txt_name, "_tolldns-verification.example.com");
    assert.match(body.txt_value, /^[a-f0-9]{32}$/);
    assert.deepEqual(body.ns, ["ns1.tahoecarspa.com", "ns2.tahoecarspa.com"]);
  });
});

test("POST /v1/domains/verify fails when TXT missing", async () => {
  await withServer(async (base) => {
    await fetch(`${base}/v1/domains`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: "example.com" })
    });

    const verify = await fetch(`${base}/v1/domains/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: "example.com" })
    });
    assert.equal(verify.status, 200);
    const body = await verify.json();
    assert.equal(body.verified, false);
    assert.equal(body.delegated, false);
  });
});

test("POST /v1/domains/verify passes with mocked TXT and NS", async () => {
  let ensureZoneCalls = 0;
  await withServer(
    async (base) => {
      await fetch(`${base}/v1/domains`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: "example.com" })
      });

      const verify = await fetch(`${base}/v1/domains/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: "example.com" })
      });
      const body = await verify.json();
      assert.equal(body.verified, true);
      assert.equal(body.delegated, true);
      assert.equal(ensureZoneCalls, 1);
    },
    {
      dnsChecks: {
        async checkTxt() {
          return true;
        },
        async getNameservers() {
          return ["ns1.tahoecarspa.com", "ns2.tahoecarspa.com"];
        }
      },
      pdns: {
        async ensureZone() {
          ensureZoneCalls += 1;
          return { created: true };
        },
        async bumpSerial() {
          return { bumped: true };
        },
        async listRecords() {
          return [];
        },
        async addRecord() {
          return { ok: true };
        },
        async deleteRecord() {
          return { ok: true };
        }
      }
    }
  );
});

test("record CRUD routes call PDNS client", async () => {
  const calls = [];
  await withServer(
    async (base) => {
      await fetch(`${base}/v1/domains`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: "example.com" })
      });
      await fetch(`${base}/v1/domains/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: "example.com" })
      });

      const add = await fetch(`${base}/v1/domains/example.com/records`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "A", name: "www.example.com", value: "1.2.3.4", ttl: 120 })
      });
      assert.equal(add.status, 200);

      const list = await fetch(`${base}/v1/domains/example.com/records`);
      assert.equal(list.status, 200);

      const del = await fetch(`${base}/v1/domains/example.com/records`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "A", name: "www.example.com" })
      });
      assert.equal(del.status, 200);

      assert.ok(calls.some((c) => c.op === "add"));
      assert.ok(calls.some((c) => c.op === "list"));
      assert.ok(calls.some((c) => c.op === "del"));
    },
    {
      dnsChecks: {
        async checkTxt() {
          return true;
        },
        async getNameservers() {
          return ["ns1.tahoecarspa.com", "ns2.tahoecarspa.com"];
        }
      },
      pdns: {
        async ensureZone() {
          return { created: true };
        },
        async bumpSerial() {
          return { bumped: true };
        },
        async addRecord(domain, rec) {
          calls.push({ op: "add", domain, rec });
          return { ok: true };
        },
        async listRecords(domain) {
          calls.push({ op: "list", domain });
          return [{ name: "www.example.com.", type: "A", ttl: 120, records: ["1.2.3.4"] }];
        },
        async deleteRecord(domain, rec) {
          calls.push({ op: "del", domain, rec });
          return { ok: true };
        }
      }
    }
  );
});

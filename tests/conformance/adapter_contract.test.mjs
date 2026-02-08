import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

const root = path.resolve(process.cwd());
const adaptorsDir = path.join(root, "adapters");

const entries = fs.readdirSync(adaptorsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => !name.startsWith("."));

const failures = [];

for (const name of entries) {
  if (["layoutanchorv1.md", "layoutsv1.2.md", "readmeandlayout.md"].includes(name)) continue;
  if (name.endsWith(".md")) continue;
  const adapterPath = path.join(adaptorsDir, name, "implementation", "adapter.json");
  if (!fs.existsSync(adapterPath)) {
    failures.push(`${name}: missing implementation/adapter.json`);
    continue;
  }
  const payload = JSON.parse(fs.readFileSync(adapterPath, "utf8"));
  try {
    assert.strictEqual(typeof payload.name, "string");
    assert.ok(["active", "stub"].includes(payload.status));
    assert.ok(Array.isArray(payload.networks) && payload.networks.length > 0);
    assert.ok(typeof payload.supports === "string" && payload.supports.length > 0);
    assert.ok(Array.isArray(payload.errorCodes) && payload.errorCodes.length > 0);
    assert.ok(payload.resolveResponseExample && typeof payload.resolveResponseExample === "object");
    assert.ok(typeof payload.resolveResponseExample.name === "string");
    assert.ok(typeof payload.resolveResponseExample.network === "string");
    assert.ok(Array.isArray(payload.resolveResponseExample.records));
    assert.ok(payload.resolveResponseExample.records.length > 0);
    const hasType = payload.resolveResponseExample.records.some((record) => record && record.type && record.value);
    assert.ok(hasType);
    if (payload.status === "stub") {
      assert.ok(typeof payload.notes === "string" && payload.notes.length > 0);
    }
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

if (failures.length) {
  console.error("Adapter conformance failures:\n" + failures.join("\n"));
  process.exit(1);
}

console.log(`Adapter conformance passed (${entries.length} adapters checked).`);

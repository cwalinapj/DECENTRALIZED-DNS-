import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function runScript(script, args = [], env = {}) {
  return spawnSync("bash", [script, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
}

test("zone_manager set/list/resolve works for valid A record", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ddns-zone-test-"));
  const zoneFile = path.join(dir, "zone.json");
  try {
    const set = runScript("scripts/zone_manager.sh", [
      "set",
      "--name",
      "example.com",
      "--type",
      "A",
      "--value",
      "198.51.100.42",
      "--ttl",
      "300"
    ], { ZONE_FILE: zoneFile });
    assert.equal(set.status, 0, set.stderr || set.stdout);

    const resolve = runScript("scripts/zone_manager.sh", [
      "resolve",
      "--name",
      "example.com",
      "--type",
      "A"
    ], { ZONE_FILE: zoneFile });
    assert.equal(resolve.status, 0, resolve.stderr || resolve.stdout);
    assert.match(resolve.stdout, /198\.51\.100\.42/);
    assert.match(resolve.stdout, /"ttl": 300/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("zone_manager rejects invalid type/ip/ttl", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ddns-zone-test-"));
  const zoneFile = path.join(dir, "zone.json");
  try {
    const badType = runScript("scripts/zone_manager.sh", [
      "set",
      "--name",
      "example.com",
      "--type",
      "MX",
      "--value",
      "mail.example.com"
    ], { ZONE_FILE: zoneFile });
    assert.notEqual(badType.status, 0);
    assert.match(badType.stderr, /A\|CNAME\|TXT/);

    const badIp = runScript("scripts/zone_manager.sh", [
      "set",
      "--name",
      "example.com",
      "--type",
      "A",
      "--value",
      "999.1.2.3"
    ], { ZONE_FILE: zoneFile });
    assert.notEqual(badIp.status, 0);
    assert.match(badIp.stderr, /valid IPv4/);

    const badTtl = runScript("scripts/zone_manager.sh", [
      "set",
      "--name",
      "example.com",
      "--type",
      "A",
      "--value",
      "198.51.100.42",
      "--ttl",
      "0"
    ], { ZONE_FILE: zoneFile });
    assert.notEqual(badTtl.status, 0);
    assert.match(badTtl.stderr, /1\.\.86400/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ns_front_door prints nameserver onboarding instructions", () => {
  const res = runScript("scripts/ns_front_door.sh", ["example.com"], {
    DDNS_NS_1: "ns1.staging.tolldns.io",
    DDNS_NS_2: "ns2.staging.tolldns.io"
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /ns1\.staging\.tolldns\.io/);
  assert.match(res.stdout, /ns2\.staging\.tolldns\.io/);
  assert.match(res.stdout, /scripts\/zone_manager\.sh set/);
});

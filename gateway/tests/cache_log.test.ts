import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeRrsetHashFromAnswers, createCacheLogger, extractPremiumParent } from "../src/cache_log.js";

describe("cache log v1", () => {
  it("extracts premium parent from subdomain", () => {
    expect(extractPremiumParent("api.acme.dns", "last2-dns")).toBe("acme.dns");
    expect(extractPremiumParent("acme.dns", "last2-dns")).toBeNull();
    expect(extractPremiumParent("example.com", "last2-dns")).toBeNull();
  });

  it("hashes rrset independent of answer ordering", () => {
    const a = computeRrsetHashFromAnswers("api.acme.dns", "A", [
      { name: "api.acme.dns", type: "A", data: "1.1.1.1" },
      { name: "api.acme.dns", type: "A", data: "2.2.2.2" }
    ]);
    const b = computeRrsetHashFromAnswers("api.acme.dns", "A", [
      { name: "api.acme.dns", type: "A", data: "2.2.2.2" },
      { name: "api.acme.dns", type: "A", data: "1.1.1.1" }
    ]);
    expect(a).toBe(b);
  });

  it("writes privacy-safe entry to spool", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ddns-cache-log-test-"));
    const spool = path.join(tmpDir, "cache-log.jsonl");

    const logger = createCacheLogger({
      enabled: true,
      spoolPath: spool,
      parentExtractRule: "last2-dns",
      witnessPrivateKeyHex: "11".repeat(32)
    });

    await logger.logEntry({
      name: "api.acme.dns",
      rrsetHashHex: "aa".repeat(32),
      ttlS: 60,
      confidenceBps: 9000
    });

    const lines = fs.readFileSync(spool, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.name_hash).toBeTypeOf("string");
    expect(parsed.parent_name_hash).toBeTypeOf("string");
    expect(parsed.rrset_hash).toHaveLength(64);
    expect(parsed.signature).toHaveLength(128);
    expect(parsed).not.toHaveProperty("ip");
    expect(parsed).not.toHaveProperty("user_agent");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";

const cachePath = path.resolve(process.cwd(), "tests/.tmp-status-cache.json");

function dnsJsonAnswer(name: string, type: number, data: string, ttl = 60) {
  return { Status: 0, Answer: [{ name, type, TTL: ttl, data }] };
}

async function loadApp() {
  vi.resetModules();
  const mod = await import("../src/server.js");
  return mod.createApp();
}

describe("/v1/status", () => {
  beforeEach(() => {
    try {
      fs.unlinkSync(cachePath);
    } catch {}
    process.env.CACHE_PATH = cachePath;
    process.env.RECURSIVE_UPSTREAMS = "https://cloudflare-dns.com/dns-query,https://dns.google/dns-query";
    process.env.RECURSIVE_QUORUM_MIN = "2";
    process.env.CACHE_TTL_MAX_S = "300";
  });

  afterEach(() => {
    delete process.env.CACHE_PATH;
    delete process.env.RECURSIVE_UPSTREAMS;
    delete process.env.RECURSIVE_QUORUM_MIN;
    delete process.env.CACHE_TTL_MAX_S;
  });

  it("returns recursive health + cache + attack-mode summary", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("dns-query")) {
        return { ok: true, json: async () => dnsJsonAnswer("netflix.com", 1, "203.0.113.61", 120) };
      }
      throw new Error(`unexpected_url:${url}`);
    }) as any;

    // @ts-expect-error test mock
    globalThis.fetch = fetchMock;

    const app = await loadApp();

    const resolved = await request(app).get("/v1/resolve").query({ name: "netflix.com", type: "A" });
    expect(resolved.status).toBe(200);

    const status = await request(app).get("/v1/status");
    expect(status.status).toBe(200);
    expect(status.body.ok).toBe(true);
    expect(status.body.service).toBe("gateway");
    expect(Array.isArray(status.body.recursive_upstreams)).toBe(true);
    expect(status.body.recursive_upstreams.length).toBeGreaterThan(0);
    expect(status.body.recursive_upstreams[0].url).toContain("dns");
    expect(status.body.resolve.total_requests).toBeGreaterThanOrEqual(1);
    expect(status.body.resolve.icann_requests).toBeGreaterThanOrEqual(1);
    expect(status.body.cache.entries_in_memory).toBeTypeOf("number");
    expect(status.body.attack_mode.endpoint).toBe("/v1/attack-mode");
  });
});

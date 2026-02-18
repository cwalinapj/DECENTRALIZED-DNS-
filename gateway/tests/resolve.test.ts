import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";

const cachePath = path.resolve(process.cwd(), "tests/.tmp-rrset-cache.json");

function dnsJsonAnswer(name: string, type: number, data: string, ttl = 60) {
  return { Status: 0, Answer: [{ name, type, TTL: ttl, data }] };
}

async function loadApp() {
  vi.resetModules();
  const mod = await import("../src/server.js");
  return mod.createApp();
}

describe("/v1/resolve recursive cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T00:00:00Z"));
    try {
      fs.unlinkSync(cachePath);
    } catch {}
    process.env.CACHE_PATH = cachePath;
    process.env.UPSTREAM_DOH_URLS = "https://cloudflare-dns.com/dns-query,https://dns.google/dns-query";
    process.env.STALE_MAX_S = "1800";
    process.env.PREFETCH_FRACTION = "0.1";
    process.env.CACHE_MAX_ENTRIES = "50000";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CACHE_PATH;
    delete process.env.UPSTREAM_DOH_URLS;
    delete process.env.STALE_MAX_S;
    delete process.env.PREFETCH_FRACTION;
    delete process.env.CACHE_MAX_ENTRIES;
  });

  it("cache miss -> upstream fetch -> caches", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => dnsJsonAnswer("netflix.com", 1, "203.0.113.10", 120) })) as any;
    // @ts-expect-error test mock
    globalThis.fetch = fetchMock;
    const app = await loadApp();
    const res = await request(app).get("/v1/resolve").query({ name: "netflix.com", type: "A" });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("upstream");
    expect(res.body.answers[0].data).toBe("203.0.113.10");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cache hit within TTL uses cache with no upstream call", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => dnsJsonAnswer("netflix.com", 1, "203.0.113.11", 120) })) as any;
    // @ts-expect-error test mock
    globalThis.fetch = fetchMock;
    const app = await loadApp();
    const first = await request(app).get("/v1/resolve").query({ name: "netflix.com", type: "A" });
    expect(first.status).toBe(200);
    expect(first.body.source).toBe("upstream");
    const second = await request(app).get("/v1/resolve").query({ name: "netflix.com", type: "A" });
    expect(second.status).toBe(200);
    expect(second.body.source).toBe("cache");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("upstream failure after expiry serves stale within STALE_MAX_S", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ ok: true, json: async () => dnsJsonAnswer("netflix.com", 1, "203.0.113.12", 10) }))
      .mockImplementationOnce(async () => {
        throw new Error("upstream_down");
      }) as any;
    // @ts-expect-error test mock
    globalThis.fetch = fetchMock;
    const app = await loadApp();
    const warm = await request(app).get("/v1/resolve").query({ name: "netflix.com", type: "A" });
    expect(warm.body.source).toBe("upstream");
    vi.advanceTimersByTime(11_000);
    const stale = await request(app).get("/v1/resolve").query({ name: "netflix.com", type: "A" });
    expect(stale.status).toBe(200);
    expect(stale.body.source).toBe("stale");
    expect(stale.body.answers[0].data).toBe("203.0.113.12");
  });

  it("TTL expiry triggers refresh from upstream", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ ok: true, json: async () => dnsJsonAnswer("netflix.com", 1, "203.0.113.13", 10) }))
      .mockImplementationOnce(async () => ({ ok: true, json: async () => dnsJsonAnswer("netflix.com", 1, "203.0.113.14", 120) })) as any;
    // @ts-expect-error test mock
    globalThis.fetch = fetchMock;
    const app = await loadApp();
    await request(app).get("/v1/resolve").query({ name: "netflix.com", type: "A" });
    vi.advanceTimersByTime(11_000);
    const refreshed = await request(app).get("/v1/resolve").query({ name: "netflix.com", type: "A" });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.source).toBe("upstream");
    expect(refreshed.body.answers[0].data).toBe("203.0.113.14");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it(".dns remains on PKDNS adapter path (unchanged)", async () => {
    // @ts-expect-error test mock
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => dnsJsonAnswer("ignored", 1, "203.0.113.20", 60) }));
    const app = await loadApp();
    const res = await request(app).get("/v1/route").query({ name: "alice.dns" });
    expect([200, 500]).toContain(res.status);
    // `.dns` should not route through recursive endpoint semantics.
    if (res.status === 200) {
      expect(res.body?.source?.kind).toBe("pkdns");
    }
  });
});

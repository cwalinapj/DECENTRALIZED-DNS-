import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRecursiveAdapter } from "../src/adapters/recursive.js";

function mkPath(name: string) {
  return path.resolve(process.cwd(), `tests/.tmp-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

function cleanup(file: string) {
  try {
    fs.unlinkSync(file);
  } catch {}
}

function upstreamFetch(payloadByHost: Record<string, any>) {
  return (async (url: string) => {
    const host = new URL(url).host;
    const payload = payloadByHost[host];
    if (payload instanceof Error) throw payload;
    return {
      ok: true,
      json: async () => payload
    } as any;
  }) as typeof fetch;
}

describe("recursive adapter quorum logic", () => {
  it("returns high confidence when upstream rrset hashes match despite answer order", async () => {
    const cachePath = mkPath("high-order");
    const adapter = createRecursiveAdapter({
      upstreamDohUrls: ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"],
      cachePath,
      staleMaxS: 1800,
      prefetchFraction: 0.1,
      cacheMaxEntries: 100,
      quorumMin: 2,
      fetchImpl: upstreamFetch({
        "cloudflare-dns.com": {
          Status: 0,
          Answer: [
            { name: "netflix.com", type: 1, TTL: 300, data: "203.0.113.20" },
            { name: "netflix.com", type: 1, TTL: 300, data: "203.0.113.10" }
          ]
        },
        "dns.google": {
          Status: 0,
          Answer: [
            { name: "netflix.com", type: 1, TTL: 250, data: "203.0.113.10" },
            { name: "netflix.com", type: 1, TTL: 250, data: "203.0.113.20" }
          ]
        }
      })
    });
    const out = await adapter.resolveRecursive("netflix.com", "A");
    expect(out.confidence).toBe("high");
    expect(out.ttlS).toBe(250);
    expect(out.rrsetHash).toMatch(/^[a-f0-9]{64}$/);
    cleanup(cachePath);
  });

  it("keeps high confidence when CNAME chains converge to same final rrset", async () => {
    const cachePath = mkPath("high-cname");
    const payload = {
      Status: 0,
      Answer: [
        { name: "www.netflix.com", type: 5, TTL: 60, data: "edge.netflix.net." },
        { name: "edge.netflix.net", type: 1, TTL: 60, data: "203.0.113.55" }
      ]
    };
    const adapter = createRecursiveAdapter({
      upstreamDohUrls: ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"],
      cachePath,
      staleMaxS: 1800,
      prefetchFraction: 0.1,
      cacheMaxEntries: 100,
      quorumMin: 2,
      fetchImpl: upstreamFetch({
        "cloudflare-dns.com": payload,
        "dns.google": payload
      })
    });
    const out = await adapter.resolveRecursive("www.netflix.com", "A");
    expect(out.confidence).toBe("high");
    expect(out.answers[0]?.data).toBe("203.0.113.55");
    cleanup(cachePath);
  });

  it("returns medium confidence for overlapping CDN answer sets", async () => {
    const cachePath = mkPath("medium-overlap");
    const adapter = createRecursiveAdapter({
      upstreamDohUrls: ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"],
      cachePath,
      staleMaxS: 1800,
      prefetchFraction: 0.1,
      cacheMaxEntries: 100,
      quorumMin: 2,
      ttlCapS: 300,
      fetchImpl: upstreamFetch({
        "cloudflare-dns.com": {
          Status: 0,
          Answer: [
            { name: "cdn.example.com", type: 1, TTL: 500, data: "198.51.100.1" },
            { name: "cdn.example.com", type: 1, TTL: 500, data: "198.51.100.2" }
          ]
        },
        "dns.google": {
          Status: 0,
          Answer: [
            { name: "cdn.example.com", type: 1, TTL: 480, data: "198.51.100.2" },
            { name: "cdn.example.com", type: 1, TTL: 480, data: "198.51.100.3" }
          ]
        }
      })
    });
    const out = await adapter.resolveRecursive("cdn.example.com", "A");
    expect(out.confidence).toBe("medium");
    expect(out.ttlS).toBeLessThanOrEqual(120);
    cleanup(cachePath);
  });

  it("caps NXDOMAIN cache TTL to 30 seconds", async () => {
    const cachePath = mkPath("nxdomain");
    const adapter = createRecursiveAdapter({
      upstreamDohUrls: ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"],
      cachePath,
      staleMaxS: 1800,
      prefetchFraction: 0.1,
      cacheMaxEntries: 100,
      quorumMin: 2,
      fetchImpl: upstreamFetch({
        "cloudflare-dns.com": { Status: 3, Answer: [] },
        "dns.google": { Status: 3, Answer: [] }
      })
    });
    const out = await adapter.resolveRecursive("nope.example", "A");
    expect(out.status).toBe("NXDOMAIN");
    expect(out.ttlS).toBeLessThanOrEqual(30);
    cleanup(cachePath);
  });

  it("falls back to low confidence when only one upstream succeeds", async () => {
    const cachePath = mkPath("one-upstream");
    const adapter = createRecursiveAdapter({
      upstreamDohUrls: ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"],
      cachePath,
      staleMaxS: 1800,
      prefetchFraction: 0.1,
      cacheMaxEntries: 100,
      quorumMin: 2,
      fetchImpl: upstreamFetch({
        "cloudflare-dns.com": {
          Status: 0,
          Answer: [{ name: "example.com", type: 1, TTL: 120, data: "203.0.113.90" }]
        },
        "dns.google": new Error("timeout")
      })
    });
    const out = await adapter.resolveRecursive("example.com", "A");
    expect(out.confidence).toBe("low");
    expect(out.answers[0]?.data).toBe("203.0.113.90");
    cleanup(cachePath);
  });
});

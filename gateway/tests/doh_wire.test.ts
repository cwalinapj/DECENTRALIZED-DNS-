import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import dnsPacket from "dns-packet";
import fs from "node:fs";
import path from "node:path";

const cachePath = path.resolve(process.cwd(), "tests/.tmp-doh-wire-cache.json");

function dnsJsonAnswer(name: string, type: number, data: string, ttl = 60) {
  return { Status: 0, Answer: [{ name, type, TTL: ttl, data }] };
}

async function loadApp() {
  vi.resetModules();
  const mod = await import("../src/server.js");
  return mod.createApp();
}

function binaryParser(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
}

describe("/dns-query RFC8484 wireformat", () => {
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

  it("POST dns-message query returns A record wire response", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => dnsJsonAnswer("netflix.com", 1, "203.0.113.30", 1200) })) as any;
    // @ts-expect-error test mock
    globalThis.fetch = fetchMock;

    const app = await loadApp();
    const query = dnsPacket.encode({
      type: "query",
      id: 0x1234,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: "A", name: "netflix.com", class: "IN" }]
    });

    const res = await request(app)
      .post("/dns-query")
      .set("content-type", "application/dns-message")
      .set("accept", "application/dns-message")
      .buffer(true)
      .parse(binaryParser)
      .send(Buffer.from(query));

    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"] || "")).toContain("application/dns-message");

    const decoded = dnsPacket.decode(Buffer.from(res.body)) as any;
    expect(Number(decoded.id)).toBe(0x1234);
    expect(Array.isArray(decoded.answers)).toBe(true);
    expect(decoded.answers.length).toBeGreaterThan(0);
    expect(decoded.answers[0].type).toBe("A");
    expect(decoded.answers[0].data).toBe("203.0.113.30");
    expect(Number(decoded.answers[0].ttl)).toBeLessThanOrEqual(300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("GET dns=base64url query returns wireformat response", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => dnsJsonAnswer("netflix.com", 1, "203.0.113.40", 120) })) as any;
    // @ts-expect-error test mock
    globalThis.fetch = fetchMock;

    const app = await loadApp();
    const query = dnsPacket.encode({
      type: "query",
      id: 0x7777,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: "A", name: "netflix.com", class: "IN" }]
    });
    const dns = Buffer.from(query).toString("base64url");

    const res = await request(app)
      .get("/dns-query")
      .query({ dns })
      .set("accept", "application/dns-message")
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    const decoded = dnsPacket.decode(Buffer.from(res.body)) as any;
    expect(Number(decoded.id)).toBe(0x7777);
    expect(decoded.answers.length).toBeGreaterThan(0);
    expect(decoded.answers[0].data).toBe("203.0.113.40");
  });
});

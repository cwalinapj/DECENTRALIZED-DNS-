import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import dnsPacket from "dns-packet";
import { createApp } from "../src/server.js";

describe("/resolve", () => {
  beforeEach(() => {
    // mock fetch with a deterministic DNS response
    // @ts-expect-error test override
    globalThis.fetch = vi.fn(async () => {
      const response = dnsPacket.encode({
        type: "response",
        id: 1,
        flags: dnsPacket.RECURSION_DESIRED | dnsPacket.RECURSION_AVAILABLE,
        questions: [{ type: "A", name: "example.com", class: "IN" }],
        answers: [{ type: "A", name: "example.com", class: "IN", ttl: 60, data: "203.0.113.10" }]
      });
      return {
        ok: true,
        arrayBuffer: async () => response.buffer
      } as any;
    });
  });

  it("resolves example.com", async () => {
    const app = createApp();
    const res = await request(app).get("/resolve").query({ name: "example.com" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("example.com");
    expect(res.body.records.length).toBeGreaterThan(0);
  });
});

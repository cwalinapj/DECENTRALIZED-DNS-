import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";

const IPFS_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const AR_TX = "oB9jQ4g3yRi2sPvq4QTYuQdRrYWw4s7P1mXLfTzT3m4";

function makeRegistry() {
  return {
    async resolveAuto(input: { name: string }) {
      const name = input.name.toLowerCase();
      if (name === "ens-ipfs.eth") {
        return {
          name,
          nameHashHex: "0x" + "11".repeat(32),
          dest: `ipfs://${IPFS_CID}`,
          destHashHex: "0x" + "22".repeat(32),
          ttlS: 300,
          source: { kind: "ens", ref: "eth_call", confidenceBps: 8000 },
          proof: {
            type: "onchain",
            payload: {
              adapter: "ens",
              chainId: 1,
              record_source: "contenthash",
              raw_value: "0xdeadbeef",
              parsed_target: { scheme: "ipfs", value: IPFS_CID }
            }
          }
        };
      }
      if (name === "ens-ar.eth") {
        return {
          name,
          nameHashHex: "0x" + "11".repeat(32),
          dest: `ar://${AR_TX}`,
          destHashHex: "0x" + "22".repeat(32),
          ttlS: 300,
          source: { kind: "ens", ref: "eth_call", confidenceBps: 8000 },
          proof: {
            type: "onchain",
            payload: {
              adapter: "ens",
              chainId: 1,
              record_source: "contenthash",
              raw_value: "0xbeef",
              parsed_target: { scheme: "ar", value: AR_TX }
            }
          }
        };
      }
      if (name === "ens-text-cid.eth") {
        return {
          name,
          nameHashHex: "0x" + "11".repeat(32),
          dest: `ipfs://${IPFS_CID}`,
          destHashHex: "0x" + "22".repeat(32),
          ttlS: 300,
          source: { kind: "ens", ref: "eth_call", confidenceBps: 8000 },
          proof: {
            type: "onchain",
            payload: {
              adapter: "ens",
              chainId: 1,
              record_source: "text",
              record_key: "content",
              raw_value: IPFS_CID,
              parsed_target: { scheme: "ipfs", value: IPFS_CID }
            }
          }
        };
      }
      if (name === "sns-ar.sol") {
        return {
          name,
          nameHashHex: "0x" + "11".repeat(32),
          dest: `ar://${AR_TX}`,
          destHashHex: "0x" + "22".repeat(32),
          ttlS: 300,
          source: { kind: "sns", ref: "mock", confidenceBps: 8000 },
          proof: {
            type: "onchain",
            payload: {
              adapter: "sns",
              cluster: "devnet",
              record_source: "text",
              record_key: "content",
              raw_value: `ar://${AR_TX}`,
              parsed_target: { scheme: "ar", value: AR_TX }
            }
          }
        };
      }
      if (name === "oversize.eth") {
        return {
          name,
          nameHashHex: "0x" + "11".repeat(32),
          dest: `ipfs://${IPFS_CID}`,
          destHashHex: "0x" + "22".repeat(32),
          ttlS: 300,
          source: { kind: "ens", ref: "mock", confidenceBps: 1000 },
          proof: { type: "none", payload: { mock: true } }
        };
      }
      if (name === "low-traffic.com") {
        return {
          name,
          nameHashHex: "0x" + "11".repeat(32),
          dest: `ipfs://${IPFS_CID}`,
          destHashHex: "0x" + "22".repeat(32),
          ttlS: 300,
          source: { kind: "recursive", ref: "mock", confidenceBps: 1000 },
          proof: { type: "none", payload: { mock: true } }
        };
      }
      return {
        name,
        nameHashHex: "0x" + "11".repeat(32),
        dest: "https://example.com",
        destHashHex: "0x" + "22".repeat(32),
        ttlS: 300,
        source: { kind: "recursive", ref: "mock", confidenceBps: 1000 },
        proof: { type: "none", payload: { mock: true } }
      };
    }
  };
}

describe("/v1/site hosting targets", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("serves ENS contenthash -> ipfs fixture bytes", async () => {
    // @ts-expect-error test mock
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes(`/ipfs/${IPFS_CID}/index.html`)) {
        return new Response("<html>ens ipfs</html>", {
          status: 200,
          headers: { "content-type": "text/html", "content-length": "22" }
        });
      }
      return new Response("not found", { status: 404 });
    });

    const app = createApp({ adapterRegistry: makeRegistry() as any });
    const res = await request(app).get("/v1/site").query({ name: "ens-ipfs.eth" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("ens ipfs");
    expect(String(res.headers["cache-control"] || "")).toContain("immutable");
    expect(String(res.headers["x-content-type-options"] || "")).toBe("nosniff");
  });

  it("serves ENS contenthash -> arweave fixture bytes", async () => {
    // @ts-expect-error test mock
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes(`/${AR_TX}/index.html`)) {
        return new Response("<html>ens ar</html>", {
          status: 200,
          headers: { "content-type": "text/html", "content-length": "20" }
        });
      }
      return new Response("not found", { status: 404 });
    });

    const app = createApp({ adapterRegistry: makeRegistry() as any });
    const res = await request(app).get("/v1/site").query({ name: "ens-ar.eth" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("ens ar");
  });

  it("normalizes ENS text content raw CID into ipfs destination", async () => {
    const app = createApp({ adapterRegistry: makeRegistry() as any });
    const res = await request(app).get("/v1/route").query({ name: "ens-text-cid.eth" });
    expect(res.status).toBe(200);
    expect(res.body.dest).toBe(`ipfs://${IPFS_CID}`);
    expect(res.body.proof?.payload?.record_source).toBe("text");
  });

  it("serves SNS text content ar target bytes", async () => {
    // @ts-expect-error test mock
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes(`/${AR_TX}/index.html`)) {
        return new Response("<html>sns ar</html>", {
          status: 200,
          headers: { "content-type": "text/html", "content-length": "20" }
        });
      }
      return new Response("not found", { status: 404 });
    });

    const app = createApp({ adapterRegistry: makeRegistry() as any });
    const res = await request(app).get("/v1/site").query({ name: "sns-ar.sol" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("sns ar");
  });

  it("returns 400 for non-hosting targets", async () => {
    const app = createApp({ adapterRegistry: makeRegistry() as any });
    const routeRes = await request(app).get("/v1/route").query({ name: "not-hosting.example" });
    expect(routeRes.status).toBe(200);
    expect(routeRes.body.dest).toBe("https://example.com");

    const res = await request(app).get("/v1/site").query({ name: "not-hosting.example" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("not_hosting_target");
  });

  it("returns 413 when upstream content exceeds max size", async () => {
    // @ts-expect-error test mock
    globalThis.fetch = vi.fn(async () => {
      return new Response("small", {
        status: 200,
        headers: { "content-type": "text/html", "content-length": String(6 * 1024 * 1024) }
      });
    });

    const app = createApp({ adapterRegistry: makeRegistry() as any });
    const res = await request(app).get("/v1/site").query({ name: "oversize.eth" });
    expect(res.status).toBe(413);
    expect(String(res.body.error || "")).toContain("content_too_large");
  });

  it("injects renewal grace banner overlay when delinquent flag is enabled", async () => {
    process.env.DOMAIN_BANNER_GRACE_MODE_ENABLED = "1";
    // @ts-expect-error test mock
    globalThis.fetch = vi.fn(async () => {
      return new Response("<html><body><h1>site</h1></body></html>", {
        status: 200,
        headers: { "content-type": "text/html", "content-length": "38" }
      });
    });

    const app = createApp({ adapterRegistry: makeRegistry() as any });
    const res = await request(app).get("/v1/site").query({ name: "low-traffic.com" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Renewal grace mode:");
    expect(res.text).toContain("Complete payment");
    expect(String(res.headers["x-ddns-renewal-banner"] || "")).toBe("grace_mode");
    delete process.env.DOMAIN_BANNER_GRACE_MODE_ENABLED;
  });
});

import express from "express";
import dnsPacket from "dns-packet";

const PORT = Number(process.env.PORT || "8054");
const UPSTREAM_DOH_URL = process.env.UPSTREAM_DOH_URL || "https://cloudflare-dns.com/dns-query";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || "2000");
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "development" ? "verbose" : "quiet");

function logInfo(message: string) {
  if (LOG_LEVEL !== "quiet") {
    console.log(message);
  }
}

const cache = new Map<string, { expiresAt: number; payload: ResolveResponse }>();

export type ResolveRecord = { type: string; value: string; ttl?: number };
export type ResolveResponse = {
  name: string;
  network: string;
  records: ResolveRecord[];
  metadata: Record<string, unknown>;
};

function cacheGet(key: string): ResolveResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key: string, ttlMs: number, payload: ResolveResponse) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, payload });
}

async function resolveViaDoh(name: string): Promise<{ records: ResolveRecord[]; ttl: number }> {
  const query = dnsPacket.encode({
    type: "query",
    id: Math.floor(Math.random() * 65535),
    flags: dnsPacket.RECURSION_DESIRED,
    questions: [{ type: "A", name, class: "IN" }]
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(UPSTREAM_DOH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/dns-message",
        "accept": "application/dns-message"
      },
      body: Buffer.from(query),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`upstream_${res.status}`);
    }

    const arr = new Uint8Array(await res.arrayBuffer());
    const decoded = dnsPacket.decode(Buffer.from(arr)) as any;
    const answers = Array.isArray(decoded.answers) ? decoded.answers : [];

    const records = answers
      .filter((a: any) => a && a.type && a.data)
      .map((a: any) => ({ type: String(a.type), value: String(a.data), ttl: a.ttl }));

    const ttl = records.length > 0
      ? Math.max(30, Math.min(3600, Number(records[0].ttl || 60)))
      : 60;

    return { records, ttl };
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("upstream_timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function createApp() {
  const app = express();

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.get("/resolve", async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!name) return res.status(400).json({ error: "missing_name" });

    const cacheKey = `resolve:${name.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, metadata: { ...cached.metadata, cache: "hit" } });
    }

    try {
      const { records, ttl } = await resolveViaDoh(name);
      const payload: ResolveResponse = {
        name,
        network: "icann",
        records,
        metadata: {
          source: "doh",
          cache: "miss"
        }
      };
      cacheSet(cacheKey, ttl * 1000, payload);
      return res.json(payload);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const code = msg === "upstream_timeout" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
      return res.status(502).json({ error: { code, message: msg, retryable: true } });
    }
  });

  return app;
}

const app = createApp();

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    logInfo(`Listening on port ${PORT}`);
  });
}

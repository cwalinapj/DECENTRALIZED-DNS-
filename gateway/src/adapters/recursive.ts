import fs from "node:fs";
import path from "node:path";
import type { Adapter } from "./shim.js";
import { destHashHex, nameHashHex, normalizeNameForHash } from "./types.js";

export type RecursiveAdapterConfig = {
  upstreamDohUrls: string[];
  cachePath: string;
  staleMaxS: number;
  prefetchFraction: number;
  cacheMaxEntries: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type RecursiveResolveResult = {
  name: string;
  type: string;
  answers: Array<{ name: string; type: string; data: string; ttl: number }>;
  ttlS: number;
  source: "cache" | "upstream" | "stale";
  upstream?: string;
};

type CacheEntry = {
  qname: string;
  qtype: string;
  answers: Array<{ name: string; type: string; data: string; ttl: number }>;
  ttlS: number;
  fetchedAt: number;
  expiresAt: number;
  staleUntil: number;
  upstream: string;
};

type CacheFile = {
  version: 1;
  entries: Record<string, CacheEntry>;
};

export type RecursiveAdapter = Adapter & {
  resolveRecursive(name: string, qtype?: string): Promise<RecursiveResolveResult>;
};

export function createRecursiveAdapter(cfg: RecursiveAdapterConfig): RecursiveAdapter {
  const urls = cfg.upstreamDohUrls.filter(Boolean);
  if (!urls.length) {
    throw new Error("UPSTREAM_DOH_URLS_EMPTY");
  }
  const fetchImpl = cfg.fetchImpl || fetch;
  const timeoutMs = Number(cfg.requestTimeoutMs ?? 5000);
  const cache = loadCache(cfg.cachePath);
  const inFlight = new Map<string, Promise<RecursiveResolveResult>>();
  let rr = 0;

  function key(name: string, qtype: string): string {
    return `${normalizeNameForHash(name)}:${qtype.toUpperCase()}`;
  }

  function persist() {
    const entries = Object.fromEntries(cache.entries());
    const payload: CacheFile = { version: 1, entries };
    fs.mkdirSync(path.dirname(cfg.cachePath), { recursive: true });
    fs.writeFileSync(cfg.cachePath, JSON.stringify(payload, null, 2), "utf8");
  }

  function evictIfNeeded() {
    const maxEntries = Math.max(1, Number(cfg.cacheMaxEntries || 50000));
    if (cache.size <= maxEntries) return;
    const items = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
    for (let i = 0; i < items.length - maxEntries; i++) {
      cache.delete(items[i][0]);
    }
  }

  async function refresh(qname: string, qtype: string, cacheKey: string): Promise<RecursiveResolveResult> {
    const rotated = urls.slice(rr % urls.length).concat(urls.slice(0, rr % urls.length));
    rr++;
    let lastErr: unknown;
    for (const upstream of rotated) {
      try {
        const r = await queryDohJson(fetchImpl, upstream, qname, qtype, timeoutMs);
        const now = nowS();
        const entry: CacheEntry = {
          qname,
          qtype,
          answers: r.answers,
          ttlS: r.ttlS,
          fetchedAt: now,
          expiresAt: now + r.ttlS,
          staleUntil: now + r.ttlS + Math.max(0, Number(cfg.staleMaxS || 1800)),
          upstream
        };
        cache.set(cacheKey, entry);
        evictIfNeeded();
        persist();
        return { name: qname, type: qtype, answers: r.answers, ttlS: r.ttlS, source: "upstream", upstream };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("UPSTREAM_FAILED");
  }

  async function resolveRecursive(name: string, qtype = "A"): Promise<RecursiveResolveResult> {
    const qname = normalizeNameForHash(name);
    const q = qtype.toUpperCase();
    const k = key(qname, q);
    const existing = cache.get(k);
    const now = nowS();

    if (existing && now < existing.expiresAt) {
      const left = existing.expiresAt - now;
      const threshold = Math.max(5, Math.floor(existing.ttlS * Number(cfg.prefetchFraction || 0.1)));
      if (left < threshold && !inFlight.has(k)) {
        const prefetch = refresh(qname, q, k).catch(() => ({
          name: qname,
          type: q,
          answers: existing.answers,
          ttlS: Math.max(0, existing.expiresAt - nowS()),
          source: "stale" as const,
          upstream: existing.upstream
        }));
        inFlight.set(k, prefetch);
        prefetch.finally(() => inFlight.delete(k)).catch(() => undefined);
      }
      return {
        name: qname,
        type: q,
        answers: existing.answers,
        ttlS: left,
        source: "cache",
        upstream: existing.upstream
      };
    }

    try {
      const p = inFlight.get(k) || refresh(qname, q, k);
      inFlight.set(k, p);
      p.finally(() => inFlight.delete(k)).catch(() => undefined);
      return await p;
    } catch (e) {
      if (existing && now <= existing.staleUntil) {
        return {
          name: qname,
          type: q,
          answers: existing.answers,
          ttlS: Math.max(0, existing.expiresAt - now),
          source: "stale",
          upstream: existing.upstream
        };
      }
      throw e;
    }
  }

  return {
    kind: "recursive",
    async resolve(input) {
      const name = input?.name ?? "";
      if (!name) return null;
      const normalized = normalizeNameForHash(name);
      if (normalized.endsWith(".dns")) return null;
      const qtype = typeof input?.opts?.qtype === "string" ? String(input.opts.qtype) : "A";
      const out = await resolveRecursive(normalized, qtype);
      const first = out.answers[0]?.data ?? "";
      return {
        name: out.name,
        nameHashHex: nameHashHex(out.name),
        dest: first || null,
        destHashHex: destHashHex(first || ""),
        ttlS: out.ttlS,
        source: { kind: "recursive", ref: out.upstream || "doh", confidenceBps: out.source === "stale" ? 7000 : 9000 },
        proof: {
          type: "none",
          payload: {
            name: out.name,
            type: out.type,
            answers: out.answers,
            ttl_s: out.ttlS,
            source: out.source,
            upstream: out.upstream
          }
        }
      };
    },
    resolveRecursive
  };
}

function loadCache(cachePath: string): Map<string, CacheEntry> {
  try {
    if (!fs.existsSync(cachePath)) return new Map();
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as CacheFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== "object") return new Map();
    return new Map(Object.entries(parsed.entries));
  } catch {
    return new Map();
  }
}

function nowS() {
  return Math.floor(Date.now() / 1000);
}

function mapType(type: number | string): string {
  if (typeof type === "string") return type.toUpperCase();
  if (type === 1) return "A";
  if (type === 28) return "AAAA";
  if (type === 5) return "CNAME";
  if (type === 16) return "TXT";
  return String(type);
}

async function queryDohJson(
  fetchImpl: typeof fetch,
  upstream: string,
  name: string,
  qtype: string,
  timeoutMs: number
): Promise<{ answers: Array<{ name: string; type: string; data: string; ttl: number }>; ttlS: number }> {
  const u = new URL(upstream);
  u.searchParams.set("name", name);
  u.searchParams.set("type", qtype);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(u.toString(), {
      method: "GET",
      headers: { "accept": "application/dns-json" },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`upstream_${res.status}`);
    const json: any = await res.json();
    if (Number(json?.Status || 0) !== 0) {
      throw new Error(`dns_status_${json?.Status}`);
    }
    const answers = (Array.isArray(json?.Answer) ? json.Answer : [])
      .map((a: any) => ({
        name: String(a?.name || name),
        type: mapType(a?.type),
        data: String(a?.data || ""),
        ttl: Math.max(1, Number(a?.TTL || 60))
      }))
      .filter((a: any) => a.data);
    const ttlS = answers.length ? Math.max(1, Math.min(...answers.map((a: any) => a.ttl))) : 60;
    return { answers, ttlS };
  } finally {
    clearTimeout(t);
  }
}

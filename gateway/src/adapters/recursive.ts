import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Adapter } from "./shim.js";
import { destHashHex, nameHashHex, normalizeNameForHash } from "./types.js";

export type RecursiveAdapterConfig = {
  upstreamDohUrls: string[];
  cachePath: string;
  staleMaxS: number;
  prefetchFraction: number;
  cacheMaxEntries: number;
  requestTimeoutMs?: number;
  maxConcurrency?: number;
  fetchImpl?: typeof fetch;
  quorumMin?: number;
  overlapRatio?: number;
  ttlCapS?: number;
};

export type ConfidenceLevel = "high" | "medium" | "low";

export type UpstreamAudit = {
  url: string;
  rttMs: number;
  status: string;
  answersCount: number;
};

export type RecursiveResolveResult = {
  name: string;
  type: string;
  answers: Array<{ name: string; type: string; data: string; ttl: number }>;
  ttlS: number;
  source: "cache" | "upstream" | "stale";
  status: "NOERROR" | "NXDOMAIN";
  confidence: ConfidenceLevel;
  upstreamsUsed: UpstreamAudit[];
  chosenUpstream: { url: string; rttMs: number };
  rrsetHash: string;
};

type CacheEntry = {
  qname: string;
  qtype: string;
  answers: Array<{ name: string; type: string; data: string; ttl: number }>;
  ttlS: number;
  fetchedAt: number;
  expiresAt: number;
  staleUntil: number;
  sourceStatus: "NOERROR" | "NXDOMAIN";
  confidence: ConfidenceLevel;
  rrsetHash: string;
  upstreamsUsed: UpstreamAudit[];
  chosenUpstream: { url: string; rttMs: number };
};

type CacheFile = {
  version: 2;
  entries: Record<string, CacheEntry>;
};

export type RecursiveAdapter = Adapter & {
  resolveRecursive(name: string, qtype?: string): Promise<RecursiveResolveResult>;
};

type DnsRecord = { name: string; type: string; data: string; ttl: number };

type UpstreamResult = {
  url: string;
  rttMs: number;
  status: "NOERROR" | "NXDOMAIN" | "ERROR";
  chain: string[];
  answers: DnsRecord[];
  ips: string[];
  answersCount: number;
  ttlS: number;
  rrsetHash: string;
};

function hashHex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeHost(input: string): string {
  return String(input || "").trim().toLowerCase().replace(/\.$/, "");
}

function mapType(type: number | string): string {
  if (typeof type === "string") return type.toUpperCase();
  if (type === 1) return "A";
  if (type === 28) return "AAAA";
  if (type === 5) return "CNAME";
  if (type === 16) return "TXT";
  return String(type);
}

function nowS() {
  return Math.floor(Date.now() / 1000);
}

function overlapRatio(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let shared = 0;
  for (const ip of sa) {
    if (sb.has(ip)) shared++;
  }
  return shared / Math.max(1, Math.min(sa.size, sb.size));
}

function hasSharedIp(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const sb = new Set(b);
  return a.some((ip) => sb.has(ip));
}

function minTtl(records: DnsRecord[], fallback = 60): number {
  if (!records.length) return fallback;
  return Math.max(1, Math.min(...records.map((r) => r.ttl)));
}

function normalizeAndExtract(
  qname: string,
  qtype: "A" | "AAAA",
  json: any
): Pick<UpstreamResult, "status" | "chain" | "answers" | "ips" | "answersCount" | "ttlS" | "rrsetHash"> {
  const statusCode = Number(json?.Status ?? 2);
  const records: DnsRecord[] = (Array.isArray(json?.Answer) ? json.Answer : [])
    .map((a: any) => ({
      name: normalizeHost(String(a?.name || "")),
      type: mapType(a?.type),
      data: String(a?.data || ""),
      ttl: Math.max(1, Number(a?.TTL || 60))
    }))
    .filter((r: DnsRecord) => r.name && r.type && r.data);

  if (statusCode === 3) {
    return {
      status: "NXDOMAIN",
      chain: [],
      answers: [],
      ips: [],
      answersCount: 0,
      ttlS: 30,
      rrsetHash: hashHex(`${qtype}|${normalizeHost(qname)}|NXDOMAIN`)
    };
  }

  if (statusCode !== 0) {
    return {
      status: "ERROR",
      chain: [],
      answers: [],
      ips: [],
      answersCount: 0,
      ttlS: 1,
      rrsetHash: hashHex(`${qtype}|${normalizeHost(qname)}|ERROR`)
    };
  }

  const byName = new Map<string, DnsRecord[]>();
  for (const r of records) {
    const bucket = byName.get(r.name) || [];
    bucket.push(r);
    byName.set(r.name, bucket);
  }

  let current = normalizeHost(qname);
  const chain: string[] = [];
  const visited = new Set<string>();
  for (let i = 0; i < 10; i++) {
    if (visited.has(current)) break;
    visited.add(current);
    const candidates = (byName.get(current) || []).filter((r) => r.type === "CNAME");
    if (!candidates.length) break;
    const target = normalizeHost(candidates[0].data);
    if (!target) break;
    chain.push(target);
    current = target;
  }

  const finalAnswers = (byName.get(current) || []).filter((r) => r.type === qtype);
  const fallbackAnswers = records.filter((r) => r.type === qtype && r.name === normalizeHost(qname));
  const usable: DnsRecord[] = (finalAnswers.length ? finalAnswers : fallbackAnswers).map((r) => ({
    name: r.name,
    type: r.type,
    data: r.data,
    ttl: r.ttl
  }));

  const ips = [...new Set<string>(usable.map((r) => r.data))].sort((a, b) => a.localeCompare(b));
  const ttlS = minTtl(usable, 60);
  const rrsetHash = hashHex(`${qtype}|${current}|${ips.join(",")}`);

  return {
    status: "NOERROR",
    chain,
    answers: usable,
    ips,
    answersCount: usable.length,
    ttlS,
    rrsetHash
  };
}

async function queryOneUpstream(
  fetchImpl: typeof fetch,
  upstream: string,
  qname: string,
  qtype: "A" | "AAAA",
  timeoutMs: number
): Promise<UpstreamResult> {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const u = new URL(upstream);
    u.searchParams.set("name", qname);
    u.searchParams.set("type", qtype);
    const res = await fetchImpl(u.toString(), {
      method: "GET",
      headers: { accept: "application/dns-json" },
      signal: ctrl.signal
    });
    if (!res.ok) {
      return {
        url: upstream,
        rttMs: Date.now() - started,
        status: "ERROR",
        chain: [],
        answers: [],
        ips: [],
        answersCount: 0,
        ttlS: 1,
        rrsetHash: hashHex(`${qtype}|${normalizeHost(qname)}|HTTP_${res.status}`)
      };
    }
    const json = await res.json();
    const normalized = normalizeAndExtract(qname, qtype, json);
    return {
      url: upstream,
      rttMs: Date.now() - started,
      ...normalized
    };
  } catch {
    return {
      url: upstream,
      rttMs: Date.now() - started,
      status: "ERROR",
      chain: [],
      answers: [],
      ips: [],
      answersCount: 0,
      ttlS: 1,
      rrsetHash: hashHex(`${qtype}|${normalizeHost(qname)}|TIMEOUT`)
    };
  } finally {
    clearTimeout(t);
  }
}

async function queryUpstreams(
  fetchImpl: typeof fetch,
  urls: string[],
  qname: string,
  qtype: "A" | "AAAA",
  timeoutMs: number,
  maxConcurrency: number
): Promise<UpstreamResult[]> {
  const concurrency = Math.max(1, Math.min(maxConcurrency, urls.length));
  const out: UpstreamResult[] = new Array(urls.length);
  let next = 0;

  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= urls.length) break;
      out[idx] = await queryOneUpstream(fetchImpl, urls[idx], qname, qtype, timeoutMs);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

function selectBest(
  upstreams: UpstreamResult[],
  quorumMin: number,
  overlapThreshold: number,
  ttlCapS: number
): {
  status: "NOERROR" | "NXDOMAIN";
  confidence: ConfidenceLevel;
  chosen: UpstreamResult;
  considered: UpstreamResult[];
  ttlS: number;
} {
  const successful = upstreams.filter((u) => u.status === "NOERROR" && u.ips.length > 0);

  if (successful.length > 0) {
    const byHash = new Map<string, UpstreamResult[]>();
    for (const u of successful) {
      const bucket = byHash.get(u.rrsetHash) || [];
      bucket.push(u);
      byHash.set(u.rrsetHash, bucket);
    }
    const hashGroups = [...byHash.values()].sort((a, b) => b.length - a.length);
    const strongest = hashGroups[0] || [];

    if (strongest.length >= quorumMin) {
      const chosen = [...strongest].sort((a, b) => a.rttMs - b.rttMs)[0];
      const baseTtl = Math.min(...strongest.map((u) => u.ttlS));
      return {
        status: "NOERROR",
        confidence: "high",
        chosen,
        considered: strongest,
        ttlS: Math.max(1, Math.min(baseTtl, ttlCapS))
      };
    }

    const overlapCandidates: UpstreamResult[] = [];
    for (let i = 0; i < successful.length; i++) {
      for (let j = i + 1; j < successful.length; j++) {
        const a = successful[i];
        const b = successful[j];
        const ratio = overlapRatio(a.ips, b.ips);
        if (hasSharedIp(a.ips, b.ips) || ratio >= overlapThreshold) {
          overlapCandidates.push(a, b);
        }
      }
    }

    if (overlapCandidates.length) {
      const uniq = new Map<string, UpstreamResult>();
      for (const c of overlapCandidates) uniq.set(c.url, c);
      const considered = [...uniq.values()];
      const chosen = [...considered].sort((a, b) => a.rttMs - b.rttMs)[0];
      const baseTtl = Math.min(...considered.map((u) => u.ttlS));
      return {
        status: "NOERROR",
        confidence: "medium",
        chosen,
        considered,
        ttlS: Math.max(1, Math.min(baseTtl, ttlCapS, 120))
      };
    }

    const chosen = [...successful].sort((a, b) => a.rttMs - b.rttMs)[0];
    return {
      status: "NOERROR",
      confidence: "low",
      chosen,
      considered: [chosen],
      ttlS: Math.max(1, Math.min(chosen.ttlS, ttlCapS, 30))
    };
  }

  const nxdomain = upstreams.filter((u) => u.status === "NXDOMAIN");
  if (nxdomain.length) {
    const chosen = [...nxdomain].sort((a, b) => a.rttMs - b.rttMs)[0];
    const confidence: ConfidenceLevel = nxdomain.length >= quorumMin ? "medium" : "low";
    const baseTtl = Math.min(...nxdomain.map((n) => n.ttlS || 30));
    return {
      status: "NXDOMAIN",
      confidence,
      chosen,
      considered: nxdomain,
      ttlS: Math.max(1, Math.min(baseTtl, 30))
    };
  }

  throw new Error("UPSTREAM_FAILED");
}

export function createRecursiveAdapter(cfg: RecursiveAdapterConfig): RecursiveAdapter {
  const urls = cfg.upstreamDohUrls.filter(Boolean);
  if (!urls.length) throw new Error("UPSTREAM_DOH_URLS_EMPTY");
  const fetchImpl = cfg.fetchImpl || fetch;
  const timeoutMs = Number(cfg.requestTimeoutMs ?? 2000);
  const cache = loadCache(cfg.cachePath);
  const inFlight = new Map<string, Promise<RecursiveResolveResult>>();
  const quorumMin = Math.max(1, Number(cfg.quorumMin ?? (urls.length >= 2 ? 2 : 1)));
  const overlapThreshold = Number(cfg.overlapRatio ?? 0.34);
  const ttlCapS = Math.max(1, Number(cfg.ttlCapS ?? 300));
  const maxConcurrency = Math.max(1, Number(cfg.maxConcurrency ?? 3));

  function key(name: string, qtype: string): string {
    return `${normalizeNameForHash(name)}:${qtype.toUpperCase()}`;
  }

  function persist() {
    const payload: CacheFile = { version: 2, entries: Object.fromEntries(cache.entries()) };
    fs.mkdirSync(path.dirname(cfg.cachePath), { recursive: true });
    fs.writeFileSync(cfg.cachePath, JSON.stringify(payload, null, 2), "utf8");
  }

  function evictIfNeeded() {
    const maxEntries = Math.max(1, Number(cfg.cacheMaxEntries || 50000));
    if (cache.size <= maxEntries) return;
    const items = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
    for (let i = 0; i < items.length - maxEntries; i++) cache.delete(items[i][0]);
  }

  async function refresh(qname: string, qtype: "A" | "AAAA", cacheKey: string): Promise<RecursiveResolveResult> {
    const upstreams = await queryUpstreams(fetchImpl, urls, qname, qtype, timeoutMs, maxConcurrency);
    const chosen = selectBest(upstreams, quorumMin, overlapThreshold, ttlCapS);

    const upstreamsUsed: UpstreamAudit[] = upstreams.map((u) => ({
      url: u.url,
      rttMs: u.rttMs,
      status: u.status,
      answersCount: u.answersCount
    }));

    const now = nowS();
    const entry: CacheEntry = {
      qname,
      qtype,
      answers: chosen.status === "NOERROR" ? chosen.chosen.answers : [],
      ttlS: chosen.ttlS,
      fetchedAt: now,
      expiresAt: now + chosen.ttlS,
      staleUntil: now + chosen.ttlS + Math.max(0, Number(cfg.staleMaxS || 1800)),
      sourceStatus: chosen.status,
      confidence: chosen.confidence,
      rrsetHash: chosen.chosen.rrsetHash,
      upstreamsUsed,
      chosenUpstream: { url: chosen.chosen.url, rttMs: chosen.chosen.rttMs }
    };

    cache.set(cacheKey, entry);
    evictIfNeeded();
    persist();

    return {
      name: qname,
      type: qtype,
      answers: entry.answers,
      ttlS: entry.ttlS,
      source: "upstream",
      status: entry.sourceStatus,
      confidence: entry.confidence,
      upstreamsUsed: entry.upstreamsUsed,
      chosenUpstream: entry.chosenUpstream,
      rrsetHash: entry.rrsetHash
    };
  }

  async function resolveRecursive(name: string, qtype = "A"): Promise<RecursiveResolveResult> {
    const qname = normalizeNameForHash(name);
    const upperQtype = qtype.toUpperCase();
    if (upperQtype !== "A" && upperQtype !== "AAAA") {
      throw new Error(`Unsupported qtype "${qtype}". Only A and AAAA are supported by the recursive adapter.`);
    }
    const q = upperQtype as "A" | "AAAA";
    const k = key(qname, q);
    const now = nowS();
    const existing = cache.get(k);

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
          status: existing.sourceStatus,
          confidence: existing.confidence,
          upstreamsUsed: existing.upstreamsUsed,
          chosenUpstream: existing.chosenUpstream,
          rrsetHash: existing.rrsetHash
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
        status: existing.sourceStatus,
        confidence: existing.confidence,
        upstreamsUsed: existing.upstreamsUsed,
        chosenUpstream: existing.chosenUpstream,
        rrsetHash: existing.rrsetHash
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
          status: existing.sourceStatus,
          confidence: existing.confidence,
          upstreamsUsed: existing.upstreamsUsed,
          chosenUpstream: existing.chosenUpstream,
          rrsetHash: existing.rrsetHash
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
        source: {
          kind: "recursive",
          ref: out.chosenUpstream.url,
          confidenceBps: out.confidence === "high" ? 9500 : out.confidence === "medium" ? 7500 : 5500
        },
        proof: {
          type: "none",
          payload: {
            name: out.name,
            type: out.type,
            status: out.status,
            answers: out.answers,
            ttl_s: out.ttlS,
            source: out.source,
            confidence: out.confidence,
            rrset_hash: out.rrsetHash,
            upstreams_used: out.upstreamsUsed,
            chosen_upstream: out.chosenUpstream
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
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as Partial<CacheFile> & { entries?: Record<string, Partial<CacheEntry>> };
    if (!parsed || typeof parsed.entries !== "object" || !parsed.entries) return new Map();
    const migrated: Array<[string, CacheEntry]> = [];
    for (const [k, v] of Object.entries(parsed.entries)) {
      if (!v || typeof v !== "object") continue;
      if (typeof v.qname !== "string" || typeof v.qtype !== "string") continue;
      const chosenUpstream =
        v.chosenUpstream && typeof v.chosenUpstream.url === "string" && typeof v.chosenUpstream.rttMs === "number"
          ? v.chosenUpstream
          : { url: "unknown", rttMs: 0 };
      migrated.push([
        k,
        {
          qname: v.qname,
          qtype: v.qtype,
          answers: Array.isArray(v.answers) ? (v.answers as CacheEntry["answers"]) : [],
          ttlS: Number(v.ttlS ?? 60),
          fetchedAt: Number(v.fetchedAt ?? nowS()),
          expiresAt: Number(v.expiresAt ?? nowS()),
          staleUntil: Number(v.staleUntil ?? nowS()),
          sourceStatus: v.sourceStatus === "NXDOMAIN" ? "NXDOMAIN" : "NOERROR",
          confidence: v.confidence === "high" || v.confidence === "medium" ? v.confidence : "low",
          rrsetHash: typeof v.rrsetHash === "string" ? v.rrsetHash : hashHex(`${v.qtype}|${v.qname}|`),
          upstreamsUsed: Array.isArray(v.upstreamsUsed) ? (v.upstreamsUsed as UpstreamAudit[]) : [],
          chosenUpstream
        }
      ]);
    }
    return new Map(migrated);
  } catch {
    return new Map();
  }
}

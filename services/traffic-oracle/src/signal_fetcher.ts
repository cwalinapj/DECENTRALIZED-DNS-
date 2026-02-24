import dns from "node:dns/promises";
import type { DomainSignals } from "./types.js";
import { fetchAhrefsDomainOverview } from "./adapters/apify_ahrefs.ts";
import { fetchSemrushDomainOverview } from "./adapters/apify_semrush.ts";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "your",
  "have",
  "you",
  "our",
  "are",
  "was",
  "not"
]);

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function extractH1s(html: string): string[] {
  const list: string[] = [];
  const re = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) list.push(text);
    if (list.length >= 8) break;
  }
  return list;
}

function topKeywords(text: string, cap: number): string[] {
  const freq = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/g)) {
    const token = raw.trim();
    if (!token || token.length < 3 || token.length > 32) continue;
    if (STOPWORDS.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([word]) => word);
}

function extractEntities(title: string, h1s: string[]): string[] {
  const combined = `${title} ${h1s.join(" ")}`;
  const entityRe = /\b([A-Z][a-zA-Z0-9]{2,})\b/g;
  const out = new Set<string>();
  let m;
  while ((m = entityRe.exec(combined))) {
    out.add(m[1]);
    if (out.size >= 10) break;
  }
  return Array.from(out);
}

async function tryFetch(url: string, fetchImpl: typeof fetch): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(process.env.TRAFFIC_ORACLE_FETCH_TIMEOUT_MS || "4500"));
    try {
      const res = await fetchImpl(url, { signal: controller.signal, redirect: "follow" });
      return res;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export async function collectSignals(domain: string, fetchImpl: typeof fetch = fetch): Promise<DomainSignals> {
  const checkedAt = new Date().toISOString();
  const reasonCodes: string[] = [];

  let dnsResolves = false;
  try {
    const records = await dns.resolve4(domain);
    dnsResolves = records.length > 0;
  } catch {
    dnsResolves = false;
    reasonCodes.push("DNS_RESOLUTION_FAILED");
  }

  const [semrush, ahrefs] = await Promise.all([
    fetchSemrushDomainOverview(domain),
    fetchAhrefsDomainOverview(domain)
  ]);
  if (semrush.status === "not_configured") reasonCodes.push("SEMRUSH_NOT_CONFIGURED");
  if (ahrefs.status === "not_configured") reasonCodes.push("AHREFS_NOT_CONFIGURED");

  const https = await tryFetch(`https://${domain}/`, fetchImpl);
  const http = https ? null : await tryFetch(`http://${domain}/`, fetchImpl);
  const res = https || http;

  const statusCode = res ? res.status : null;
  const httpOk = Boolean(res && statusCode && statusCode >= 200 && statusCode < 500);

  let html = "";
  if (res) {
    try {
      html = await res.text();
    } catch {
      html = "";
    }
  }

  const title = extractTitle(html);
  const h1s = extractH1s(html);
  const keywords = topKeywords(`${title} ${h1s.join(" ")} ${html.slice(0, 25000)}`, 20);
  const entities = extractEntities(title, h1s);

  if (!res) reasonCodes.push("HTTP_FETCH_FAILED");
  if (!title) reasonCodes.push("TITLE_MISSING");
  if (h1s.length === 0) reasonCodes.push("H1_MISSING");
  if (keywords.length < 5) reasonCodes.push("LOW_KEYWORD_FOOTPRINT");

  return {
    domain,
    checked_at: checkedAt,
    dns_resolves: dnsResolves,
    http_ok: httpOk,
    status_code: statusCode,
    content_length: html.length,
    title,
    h1s,
    keywords,
    entities,
    reason_codes: reasonCodes
  };
}

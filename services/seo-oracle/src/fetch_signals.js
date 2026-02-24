import dns from "node:dns/promises";
import { extractKeywordCandidates } from "./scoring.js";

function pickH1s(html) {
  const matches = [...String(html || "").matchAll(/<h1[^>]*>(.*?)<\/h1>/gims)];
  return matches.map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 5);
}

function pickTitle(html) {
  const m = String(html || "").match(/<title[^>]*>(.*?)<\/title>/is);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function stripText(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function collectSignals(domain, fetchImpl = fetch) {
  const started = Date.now();
  let dnsResolves = false;
  try {
    const answer = await dns.resolve4(domain);
    dnsResolves = Array.isArray(answer) && answer.length > 0;
  } catch {
    dnsResolves = false;
  }

  let statusCode = 0;
  let httpOk = false;
  let body = "";
  let reasonCodes = [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.SEO_ORACLE_HTTP_TIMEOUT_MS || "5000"));
  try {
    const res = await fetchImpl(`https://${domain}`, { redirect: "follow", signal: controller.signal });
    statusCode = res.status;
    httpOk = res.ok;
    body = await res.text();
  } catch {
    reasonCodes.push("FETCH_FAILED");
  } finally {
    clearTimeout(timeout);
  }

  const title = pickTitle(body);
  const h1s = pickH1s(body);
  const bodyText = stripText(body).slice(0, 25000);
  const keywords = extractKeywordCandidates({ title, h1s, bodyText });

  return {
    domain,
    title,
    h1s,
    keywords,
    entities: keywords.slice(0, 8),
    dns_resolves: dnsResolves,
    http_ok: httpOk,
    status_code: statusCode,
    content_length: body.length,
    fetch_ms: Date.now() - started,
    reason_codes: reasonCodes
  };
}

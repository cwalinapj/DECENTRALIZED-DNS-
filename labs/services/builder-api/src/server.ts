import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SiteModel, BuildJob } from "./types.js";

const port = Number(process.env.PORT || 8833);
const dataDir = process.env.DATA_DIR || "./data";
const maxPages = Number(process.env.MAX_PAGES || 5);

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistJson(relPath: string, payload: unknown) {
  const file = path.join(dataDir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

function loadSite(siteId: string): SiteModel | null {
  const file = path.join(dataDir, `sites/${siteId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/sites") {
    const body = await readBody(req);
    if (!body?.subdomain) return sendJson(res, 400, { error: "missing_subdomain" });
    const siteId = body.siteId || `site_${crypto.randomUUID()}`;
    const pages = Array.isArray(body.pages) ? body.pages.slice(0, maxPages) : [];
    const site: SiteModel = {
      siteId,
      subdomain: body.subdomain,
      pages,
      updatedAt: new Date().toISOString()
    };
    persistJson(`sites/${siteId}.json`, site);
    return sendJson(res, 200, { site });
  }

  if (req.method === "PUT" && url.pathname.startsWith("/sites/")) {
    const siteId = url.pathname.split("/")[2];
    const body = await readBody(req);
    const existing = loadSite(siteId);
    if (!existing) return sendJson(res, 404, { error: "not_found" });
    const pages = Array.isArray(body?.pages) ? body.pages.slice(0, maxPages) : existing.pages;
    const site: SiteModel = {
      ...existing,
      pages,
      updatedAt: new Date().toISOString()
    };
    persistJson(`sites/${siteId}.json`, site);
    return sendJson(res, 200, { site });
  }

  if (req.method === "POST" && url.pathname.startsWith("/sites/") && url.pathname.endsWith("/publish")) {
    const siteId = url.pathname.split("/")[2];
    const existing = loadSite(siteId);
    if (!existing) return sendJson(res, 404, { error: "not_found" });
    const job: BuildJob = {
      jobId: `job_${crypto.randomUUID()}`,
      siteId,
      createdAt: new Date().toISOString()
    };
    persistJson(`jobs/${job.jobId}.json`, job);
    return sendJson(res, 200, { job });
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`builder api listening on ${port}`);
});

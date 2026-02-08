import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import type { SiteModel, BuildJob } from "./types.js";

const port = Number(process.env.PORT || 8833);
const dataDir = process.env.DATA_DIR || "./data";
const maxPages = Number(process.env.MAX_PAGES || 5);
const hostingDomain = process.env.HOSTING_DOMAIN || "";
const pagesMappingPath = process.env.PAGES_MAPPING_PATH || path.join(dataDir, "pages", "mapping.json");
const runLocalBuilder = process.env.RUN_LOCAL_BUILDER === "1";
const builderWorkerPath = process.env.BUILDER_WORKER_PATH || path.resolve(process.cwd(), "..", "..", "workers", "site-builder", "dist", "worker.js");
const builderOutputRoot = process.env.BUILDER_OUTPUT_ROOT || path.join(dataDir, "builds");

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

function loadJson(file: string, fallback: unknown) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadSite(siteId: string): SiteModel | null {
  const file = path.join(dataDir, `sites/${siteId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function updateMapping(subdomain: string, siteId: string) {
  const mapping = loadJson(pagesMappingPath, {}) as Record<string, string>;
  mapping[subdomain.toLowerCase()] = siteId;
  fs.mkdirSync(path.dirname(pagesMappingPath), { recursive: true });
  fs.writeFileSync(pagesMappingPath, JSON.stringify(mapping, null, 2));
}

function runBuild(jobId: string) {
  if (!runLocalBuilder) return;
  if (!fs.existsSync(builderWorkerPath)) {
    throw new Error("builder_worker_missing");
  }
  const res = spawnSync("node", [builderWorkerPath, jobId], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      OUTPUT_ROOT: builderOutputRoot
    }
  });
  if (res.status !== 0) {
    throw new Error("builder_failed");
  }
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
    return sendJson(res, 200, { site, hosted_url: hostingDomain ? `https://${site.subdomain}.${hostingDomain}` : null });
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
    return sendJson(res, 200, { site, hosted_url: hostingDomain ? `https://${site.subdomain}.${hostingDomain}` : null });
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
    try {
      runBuild(job.jobId);
      updateMapping(existing.subdomain, existing.siteId);
      return sendJson(res, 200, {
        job,
        hosted_url: hostingDomain ? `https://${existing.subdomain}.${hostingDomain}` : null
      });
    } catch (err: any) {
      return sendJson(res, 500, { error: err?.message || "build_failed", job });
    }
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`builder api listening on ${port}`);
});

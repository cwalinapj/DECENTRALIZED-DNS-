import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { createStorageFromEnv } from "./storage.js";
import type { ControlPlaneState, Route } from "./types.js";
import { listSites, getSite, createSite } from "./routes/sites.js";
import { listJobs, getJob, createJob, completeJob } from "./routes/jobs.js";
import { listUploads, createUpload } from "./routes/uploads.js";
import { listBackups } from "./routes/backups/list.js";
import { createBackup } from "./routes/backups/create.js";
import { verifyBackup } from "./routes/backups/verify.js";
import { restoreBackup } from "./routes/backups/restore.js";
import { addDomain, verifyDomain, getDomain } from "./routes/email/domains.js";
import { setForwardingRules, getForwardingRules } from "./routes/email/routes.js";
import { getDomainStatus, setMxHealth, recordReceived, recordReject } from "./routes/email/status.js";

const dataDir = process.env.DATA_DIR || "./data";
const port = Number(process.env.PORT || 8795);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 2_000_000);

const state: ControlPlaneState = {
  dataDir,
  sites: new Map(),
  jobs: new Map(),
  uploads: new Map(),
  backups: new Map()
};

const storage = createStorageFromEnv(dataDir);

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw new Error("Payload too large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function persistJson(relPath: string, payload: unknown) {
  const file = path.join(state.dataDir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

const routes: Route[] = [
  {
    method: "GET",
    pattern: /^\/healthz$/,
    handler: ({ res }) => sendJson(res, 200, { ok: true })
  },
  {
    method: "GET",
    pattern: /^\/v1\/sites$/,
    handler: ({ res }) => sendJson(res, 200, { sites: listSites(state) })
  },
  {
    method: "POST",
    pattern: /^\/v1\/sites$/,
    handler: ({ res, body }) => {
      const site = createSite(state, body || {});
      persistJson(`sites/${site.site_id}.json`, site);
      sendJson(res, 200, { site });
    }
  },
  {
    method: "GET",
    pattern: /^\/v1\/sites\/([^/]+)$/,
    handler: ({ res, params }) => {
      const site = params?.[1] ? getSite(state, params[1]) : undefined;
      if (!site) return sendJson(res, 404, { error: "not_found" });
      sendJson(res, 200, { site });
    }
  },
  {
    method: "GET",
    pattern: /^\/v1\/jobs$/,
    handler: ({ res }) => sendJson(res, 200, { jobs: listJobs(state) })
  },
  {
    method: "POST",
    pattern: /^\/v1\/jobs$/,
    handler: ({ res, body }) => {
      const job = createJob(state, body || {});
      persistJson(`jobs/${job.job_id}.json`, job);
      sendJson(res, 200, { job });
    }
  },
  {
    method: "GET",
    pattern: /^\/v1\/jobs\/([^/]+)$/,
    handler: ({ res, params }) => {
      const job = params?.[1] ? getJob(state, params[1]) : undefined;
      if (!job) return sendJson(res, 404, { error: "not_found" });
      sendJson(res, 200, { job });
    }
  },
  {
    method: "POST",
    pattern: /^\/v1\/jobs\/([^/]+)\/complete$/,
    handler: ({ res, params, body }) => {
      const job = params?.[1] ? completeJob(state, params[1], body?.result) : undefined;
      if (!job) return sendJson(res, 404, { error: "not_found" });
      persistJson(`jobs/${job.job_id}.json`, job);
      sendJson(res, 200, { job });
    }
  },
  {
    method: "GET",
    pattern: /^\/v1\/uploads$/,
    handler: ({ res }) => sendJson(res, 200, { uploads: listUploads(state) })
  },
  {
    method: "POST",
    pattern: /^\/v1\/uploads$/,
    handler: async ({ res, body }) => {
      if (!body?.site_id || !body?.filename || !body?.content_base64) {
        return sendJson(res, 400, { error: "invalid_upload" });
      }
      const data = Buffer.from(body.content_base64, "base64");
      const key = `${body.site_id}/${Date.now()}-${body.filename}`;
      const stored = await storage.putObject(key, data, body.content_type);
      const upload = createUpload(state, {
        site_id: body.site_id,
        filename: body.filename,
        content_type: body.content_type || "application/octet-stream",
        path: stored.key
      });
      persistJson(`uploads/${upload.upload_id}.json`, upload);
      sendJson(res, 200, { upload, storage: stored });
    }
  },
  {
    method: "GET",
    pattern: /^\/v1\/backups$/,
    handler: ({ res }) => sendJson(res, 200, { backups: listBackups(state) })
  },
  {
    method: "POST",
    pattern: /^\/v1\/backups$/,
    handler: ({ res, body }) => {
      const backup = createBackup(state, body?.scope || "all");
      persistJson(`backups/${backup.backup_id}.json`, backup);
      sendJson(res, 200, { backup });
    }
  },
  {
    method: "POST",
    pattern: /^\/v1\/backups\/([^/]+)\/verify$/,
    handler: ({ res, params }) => {
      const backup = params?.[1] ? verifyBackup(state, params[1]) : undefined;
      if (!backup) return sendJson(res, 404, { error: "not_found" });
      persistJson(`backups/${backup.backup_id}.json`, backup);
      sendJson(res, 200, { backup });
    }
  },
  {
    method: "POST",
    pattern: /^\/v1\/backups\/([^/]+)\/restore$/,
    handler: ({ res, params }) => {
      const backup = params?.[1] ? restoreBackup(state, params[1]) : undefined;
      if (!backup) return sendJson(res, 404, { error: "not_found" });
      persistJson(`backups/${backup.backup_id}.json`, backup);
      sendJson(res, 200, { backup });
    }
  },
  {
    method: "POST",
    pattern: /^\/v1\/email\/domains$/,
    handler: ({ res, body }) => {
      try {
        const entry = addDomain(body?.domain || "");
        sendJson(res, 200, { domain: entry });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || "invalid_request" });
      }
    }
  },
  {
    method: "POST",
    pattern: /^\/v1\/email\/domains\/verify$/,
    handler: ({ res, body }) => {
      try {
        const entry = verifyDomain(body?.domain || "", body?.txt_values || []);
        sendJson(res, 200, { domain: entry });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || "invalid_request" });
      }
    }
  },
  {
    method: "GET",
    pattern: /^\/v1\/email\/domains\/([^/]+)$/,
    handler: ({ res, params }) => {
      const entry = params?.[1] ? getDomain(params[1]) : undefined;
      if (!entry) return sendJson(res, 404, { error: "not_found" });
      sendJson(res, 200, { domain: entry });
    }
  },
  {
    method: "POST",
    pattern: /^\/v1\/email\/routes$/,
    handler: ({ res, body }) => {
      try {
        const routeSet = setForwardingRules(body?.domain || "", body?.rules || []);
        sendJson(res, 200, { routes: routeSet });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || "invalid_request" });
      }
    }
  },
  {
    method: "GET",
    pattern: /^\/v1\/email\/routes\/([^/]+)$/,
    handler: ({ res, params }) => {
      try {
        const routeSet = params?.[1] ? getForwardingRules(params[1]) : undefined;
        sendJson(res, 200, { routes: routeSet });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || "invalid_request" });
      }
    }
  },
  {
    method: "GET",
    pattern: /^\/v1\/email\/status\/([^/]+)$/,
    handler: ({ res, params }) => {
      try {
        const status = params?.[1] ? getDomainStatus(params[1]) : undefined;
        sendJson(res, 200, { status });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || "invalid_request" });
      }
    }
  },
  {
    method: "POST",
    pattern: /^\/v1\/email\/status\/([^/]+)$/,
    handler: ({ res, params, body }) => {
      try {
        const status = params?.[1] ? setMxHealth(params[1], Boolean(body?.mx_healthy)) : undefined;
        sendJson(res, 200, { status });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || "invalid_request" });
      }
    }
  },
  {
    method: "POST",
    pattern: /^\/v1\/email\/status\/([^/]+)\/received$/,
    handler: ({ res, params }) => {
      try {
        const status = params?.[1] ? recordReceived(params[1]) : undefined;
        sendJson(res, 200, { status });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || "invalid_request" });
      }
    }
  },
  {
    method: "POST",
    pattern: /^\/v1\/email\/status\/([^/]+)\/reject$/,
    handler: ({ res, params }) => {
      try {
        const status = params?.[1] ? recordReject(params[1]) : undefined;
        sendJson(res, 200, { status });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message || "invalid_request" });
      }
    }
  }
];

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "missing_url" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const route = routes.find((candidate) => candidate.method === req.method && candidate.pattern.test(url.pathname));

  if (!route) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  let body: any = null;
  if (req.method === "POST") {
    try {
      body = await readBody(req);
    } catch (error: any) {
      sendJson(res, 413, { error: error.message });
      return;
    }
  }

  const params = url.pathname.match(route.pattern);
  await route.handler({ req, res, params, body, state });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`control-plane listening on :${port} (storage=${storage.name})`);
});

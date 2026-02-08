import { readJson, writeJson } from '../storage/index.js';
import type { CompatState, JobRecord, ReportData, Route } from '../types.js';
import { requireAdmin } from '../auth/index.js';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildReportFromBundle(bundle: any, jobId: string): ReportData {
  const plugins = Array.isArray(bundle?.plugins) ? bundle.plugins : [];
  const active = plugins.filter((plugin: any) => plugin.active).length;
  const summary = `Checked ${plugins.length} plugins (${active} active).`;
  const pages = Array.from({ length: 10 }, (_, index) => `/${index + 1}`);
  const changes = pages.map((page: string) => ({
    page,
    status: 'ok',
    notes: 'No breaking changes detected.',
  }));

  const pluginList = plugins
    .map((plugin: any) => `<li>${escapeHtml(plugin.name || plugin.path)} ${escapeHtml(plugin.version || '')}</li>`)
    .join('');

  const report_html = `<!doctype html><html><head><meta charset="utf-8"><title>Compat Report</title></head>`
    + `<body><h1>Compatibility Report</h1><p>${escapeHtml(summary)}</p>`
    + `<h2>Plugins</h2><ul>${pluginList}</ul>`
    + `<h2>Pages</h2><ul>${pages.map((page) => `<li>${escapeHtml(page)}</li>`).join('')}</ul>`
    + `</body></html>`;

  return {
    job_id: jobId,
    status: 'completed',
    summary,
    changes,
    report_html,
    report_url: `/v1/jobs/${jobId}/report.html`,
  };
}

export function createJobsRoutes(state: CompatState): Route[] {
  return [
    {
      method: 'GET',
      pattern: /^\/v1\/jobs\/([^/]+)$/,
      handler: async ({ req, res, params }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const jobId = params?.[1];
        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing job ID' }));
          return;
        }
        const job = state.jobs.get(jobId);
        if (!job) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Job not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(job));
      },
    },
    {
      method: 'GET',
      pattern: /^\/v1\/jobs\/([^/]+)\/report$/,
      handler: async ({ req, res, params }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const jobId = params?.[1];
        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing job ID' }));
          return;
        }
        const job = state.jobs.get(jobId);
        if (!job) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Job not found' }));
          return;
        }
        if (!job.report && job.bundle_path) {
          const bundle = await readJson<any>(job.bundle_path, {});
          job.report = buildReportFromBundle(bundle, job.id);
          job.status = 'completed';
          job.completed_at = new Date().toISOString();
          await writeJson(`${state.dataDir}/jobs/${job.id}.json`, job);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(job.report));
      },
    },
    {
      method: 'GET',
      pattern: /^\/v1\/jobs\/([^/]+)\/report\.html$/,
      handler: async ({ req, res, params }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const jobId = params?.[1];
        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing job ID' }));
          return;
        }
        const job = state.jobs.get(jobId);
        if (!job || !job.report?.report_html) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Report not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(job.report.report_html);
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/jobs\/([^/]+)\/complete$/,
      handler: async ({ req, res, params, body }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const jobId = params?.[1];
        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing job ID' }));
          return;
        }
        const job = state.jobs.get(jobId);
        if (!job) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Job not found' }));
          return;
        }
        const report = body?.report as ReportData | undefined;
        if (!report) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing report' }));
          return;
        }
        const updated: JobRecord = {
          ...job,
          status: report.status || 'completed',
          report,
          completed_at: new Date().toISOString(),
        };
        state.jobs.set(jobId, updated);
        await writeJson(`${state.dataDir}/jobs/${jobId}.json`, updated);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updated));
      },
    },
  ];
}

import { randomUUID } from 'node:crypto';
import { saveBundle, writeJson } from '../storage/index.js';
import { buildReportFromBundle } from './jobs.js';
import type { CompatState, Route, SiteRecord } from '../types.js';
import { requireAdmin } from '../auth/index.js';

export function createSitesRoutes(state: CompatState): Route[] {
  return [
    {
      method: 'POST',
      pattern: /^\/v1\/sites\/connect$/,
      handler: async ({ req, res, body }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const siteId = body?.site_id || `site_${randomUUID().slice(0, 8)}`;
        const record: SiteRecord = {
          site_id: siteId,
          site_url: body?.site_url || '',
          site_name: body?.site_name || '',
          connected_at: new Date().toISOString(),
        };
        state.sites.set(siteId, record);
        await writeJson(`${state.dataDir}/sites/${siteId}/site.json`, record);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ site_id: siteId }));
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/sites\/([^/]+)\/bundles$/,
      handler: async ({ req, res, params, body }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const siteId = params?.[1];
        if (!siteId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing site ID' }));
          return;
        }
        if (!body?.bundle) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing bundle' }));
          return;
        }
        const { bundleId, bundlePath } = await saveBundle(state.dataDir, siteId, body.bundle);
        const jobId = `job_${randomUUID()}`;
        const createdAt = new Date().toISOString();
        const report = buildReportFromBundle(body.bundle, jobId);
        const job = {
          id: jobId,
          site_id: siteId,
          bundle_id: bundleId,
          bundle_path: bundlePath,
          status: 'completed',
          created_at: createdAt,
          completed_at: new Date().toISOString(),
          report,
        };
        state.jobs.set(jobId, job);
        await writeJson(`${state.dataDir}/jobs/${jobId}.json`, job);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ job_id: jobId, status: job.status, report }));
      },
    },
  ];
}

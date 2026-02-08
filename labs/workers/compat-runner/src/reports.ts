import { promises as fs } from 'node:fs';
import path from 'node:path';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildReport(
  jobId: string,
  bundle: any,
  pages: string[],
  changes: { page: string; status: string; notes?: string }[]
) {
  const pluginCount = Array.isArray(bundle?.plugins) ? bundle.plugins.length : 0;
  const summary = `Checked ${pluginCount} plugins across ${pages.length} pages.`;
  const report_html = `<!doctype html><html><head><meta charset="utf-8">`
    + `<title>Compat Report</title></head><body>`
    + `<h1>Compatibility Report</h1><p>${escapeHtml(summary)}</p>`
    + `<h2>Pages</h2><ul>${pages.map((page) => `<li>${escapeHtml(page)}</li>`).join('')}</ul>`
    + `</body></html>`;

  return {
    job_id: jobId,
    status: 'completed',
    summary,
    pages,
    changes,
    report_html,
  };
}

export async function writeReport(outputDir: string, report: any) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `${report.job_id}.json`);
  const htmlPath = path.join(outputDir, `${report.job_id}.html`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(htmlPath, report.report_html);
}

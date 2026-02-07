import { loadBundle, spinStagingSite, crawlPages } from './wp.js';
import { captureSnapshots } from './playwright.js';
import { diffSnapshots } from './diff.js';
import { buildReport, writeReport } from './reports.js';

const jobId = process.env.JOB_ID || `job_${Date.now()}`;
const bundlePath = process.env.BUNDLE_PATH || '';
const outputDir = process.env.OUTPUT_DIR || './out';

const bundle = await loadBundle(bundlePath);
const staging = await spinStagingSite(bundle);
const pages = await crawlPages(staging, 10);
const baseline = await captureSnapshots(pages, outputDir, 'baseline');
const upgraded = await captureSnapshots(pages, outputDir, 'upgrade');
const diffs = diffSnapshots(baseline, upgraded);

const report = buildReport(jobId, bundle, pages, diffs);
await writeReport(outputDir, report);

// eslint-disable-next-line no-console
console.log(JSON.stringify(report, null, 2));

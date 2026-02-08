# Compat Runner (MVP)

Executes compatibility jobs by spinning up a staging WordPress instance,
importing the exported bundle, and producing report JSON + HTML.

## MVP Flow
1. Read bundle JSON from `BUNDLE_PATH`.
2. Simulate staging + plugin activation.
3. Crawl 10 pages.
4. Produce JSON + HTML report files.

## Environment
- `JOB_ID=job_123`
- `BUNDLE_PATH=/data/bundle.json`
- `OUTPUT_DIR=/data/reports`

## Notes
- Playwright snapshots and pixel diffs are stubbed for MVP-2.
- Wire this worker to the control plane job queue for full automation.

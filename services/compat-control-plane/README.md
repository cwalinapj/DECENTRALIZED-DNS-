# Compat Control Plane (MVP)

Receives site registrations and uploaded bundles, creates compatibility jobs,
and runs a runner container to produce a report.

Endpoints:
- POST /v1/sites/register
- POST /v1/uploads/:site_id (multipart)
- POST /v1/jobs/create
- GET  /v1/jobs/:id

Auth:
- Site token returned at registration; required for uploads/jobs.

Storage:
- ./data/sites.json
- ./data/uploads/<upload_id>.zip
- ./data/jobs/<job_id>.json
- ./data/reports/<job_id>/...

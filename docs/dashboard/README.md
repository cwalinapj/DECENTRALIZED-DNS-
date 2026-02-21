# Dashboard Publish Notes

This dashboard is read-only and safe when `reports/latest.json` is missing.

## Local

Run from repo root:

```bash
bash scripts/generate_dashboard_report.sh
python3 -m http.server 8080
open http://localhost:8080/docs/dashboard/
```

## GitHub Pages (optional)

If GitHub Pages is enabled for this repository root, the dashboard path is:

- `/docs/dashboard/index.html`

The page reads `reports/latest.json` and gracefully shows `No data yet` when the report is absent.

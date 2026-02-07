# Compat Runner (MVP)

Consumes /in/bundle.zip, unpacks, runs basic checks, captures screenshots via Playwright,
writes /out/report.json and /out/screens/*.png.

Build:
docker build -t ddns-compat-runner:latest .

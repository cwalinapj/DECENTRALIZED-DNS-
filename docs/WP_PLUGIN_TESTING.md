# WordPress Plugin Testing (Local)

This repo vendors the Toll Comments plugin under `plugins/toll-comments`. Use the
docker harness below to run WordPress + the credits coordinator locally.

## Start
```bash
./scripts/wp-test.sh
```

Services:
- WordPress: http://localhost:8087
- Coordinator: http://localhost:8822/healthz

Site token (for plugin settings): `dev-site-token`

## Notes
- The plugin is mounted into WordPress as a local plugin.
- The coordinator runs in a Node container with its own data volume.

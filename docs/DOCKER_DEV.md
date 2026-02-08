# Docker Dev

## Start
```bash
docker compose -f docker-compose.dev.yml up -d
```
Run from repo root.

Or use:
```bash
./scripts/docker-up.sh
```

## Status
```bash
docker compose -f docker-compose.dev.yml ps
```

## Stop
```bash
docker compose -f docker-compose.dev.yml down
```

## Orphan containers
If you see warnings about orphan containers, run:
```bash
docker compose -f docker-compose.dev.yml down --remove-orphans
```

Or use:
```bash
./scripts/docker-down.sh
```

## Validation compose
`docker-compose.validation.yml` runs validation tooling used in CI and local checks.

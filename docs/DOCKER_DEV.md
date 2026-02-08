# Docker Dev

## Start
```bash
docker compose -f docker-compose.dev.yml up -d
```
Run from repo root.

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

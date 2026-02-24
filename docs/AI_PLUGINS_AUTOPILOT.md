# AI Plugins Autopilot (MVP scaffold)

## Objective

Provide a safe autonomous loop for site admin + SEO plugin changes:

1. create change in a git worktree sandbox
2. run CI-equivalent checks
3. open PR
4. auto-merge only when eligible and green
5. trigger post-merge deploy hook
6. create snapshots and keep rollback path
7. watchdog + self-heal for common service failures

## Components

- `services/seo-oracle/`: SEO/eligibility plugin API scaffold.
- `scripts/jive_autopilot.sh`: sandboxed automation runner (chat + autopilot modes).
- `scripts/jive_post_merge_deploy.sh`: post-merge deploy hook stub with snapshot metadata.
- `scripts/jive_rollback.sh`: snapshot lookup and rollback command helper.
- `scripts/jive_watchdog.sh`: health checks + restart + escalation.
- `deploy/pi/systemd/*.service|*.timer`: periodic execution units for Pi.

## APIs

### SEO Oracle (`services/seo-oracle`)

- `GET /healthz`
- `GET /v1/site/audit?domain=...`
- `GET /v1/keywords/suggest?domain=...`
- `POST /v1/serp/track` body `{ "domain": "example.com" }`
- `GET /v1/serp/job/:id`
- `POST /v1/scan` body `{ "domain": "example.com" }`
- `GET /v1/scan/:job_id`
- `GET /v1/check?domain=...` compatibility payload for gateway continuity worker URL.

### Deploy Hook Stub (`services/hosting-control-plane`)

- `POST /v1/deploy/hook`
- Accepted body fields: `sha`, `pr_url`, `environment`, `trigger`
- Writes local deployment event and returns `queued_stub` result.

## Trust Boundaries

- **GitHub token and OpenAI key** are loaded from root-owned files only:
  - `/etc/jive-autopilot/github_token`
  - `/etc/jive-autopilot/openai_api_key`
- Files must be owned by `root` and mode `600` or stricter.
- Scripts never print token values.
- Runtime logs only store hashed client IP (`sha256` truncated) for rate-limit/audit events.

## Memory and Autonomy Rules

- Each autopilot/watchdog run appends a semantic memory record to `~/.jive/memory.jsonl`.
- Each new task recall prints 10 bullet highlights from memory before execution.
- If auto-merge eligibility fails (missing checks, branch protection, failing checks), run stops and reports.

## Rollback and Snapshot Flow

- Before deploy hook actions, a snapshot tarball is created under `~/.jive/backups`.
- `scripts/jive_rollback.sh` resolves latest snapshot and prints restore command.
- Watchdog can escalate by invoking rollback helper when restarts fail.

## Watchdog/Self-heal

- Health checks: gateway `/healthz`, seo-oracle `/healthz`.
- First response: restart services (`jive-gateway.service`, `jive-seo-oracle.service`).
- If still failing: emit escalation memory event and return non-zero.

## Pi systemd setup

```bash
sudo cp deploy/pi/systemd/jive-autopilot.service /etc/systemd/system/
sudo cp deploy/pi/systemd/jive-autopilot.timer /etc/systemd/system/
sudo cp deploy/pi/systemd/jive-watchdog.service /etc/systemd/system/
sudo cp deploy/pi/systemd/jive-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jive-autopilot.timer
sudo systemctl enable --now jive-watchdog.timer
```

## Local test commands

```bash
npm -C services/seo-oracle test
npm -C gateway test
npm -C solana test
```

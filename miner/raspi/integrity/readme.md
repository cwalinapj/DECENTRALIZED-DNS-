# Integrity Daemon (Periodic Checks + Auto-Fix + Reward Gating)

This service runs periodic checks on the Raspberry Pi miner stack.

Goals:
- Keep the node running (no boot gating)
- Periodically verify build integrity against on-chain BuildRegistry
- If mismatch or failure:
  1) attempt safe fixes automatically
  2) generate a clear report for the owner
  3) mark node as "NOT_ELIGIBLE_FOR_REWARDS" until resolved

Outputs are written to `/mnt/nvme/ddns/state/`:
- `integrity_status.json` (machine-readable)
- `integrity_report.md` (human-readable)
- `reward_status.json` (what reward system consumes)

Optional:
- Send webhook alerts (Discord/Slack/etc) if configured.

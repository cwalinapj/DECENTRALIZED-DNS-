# Sandbox Cloning

## Purpose
- Clone snapshots into isolated sandboxes for builds and jobs.
- Ensure reproducible deployments and fast rollbacks.

## Flow
- Snapshot source volume (ZFS/Ceph).
- Create sandbox clone per job or customer action.
- Run jobs with resource limits.
- Destroy sandbox after completion.

## Token Exchange
- Each clone/job consumes hosting credits.
- Credits are purchased via token exchange.

## Security
- Sandboxes run with least privilege.
- No shared secrets between tenants.

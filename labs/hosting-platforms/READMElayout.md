services/
  hosting-orchestrator/     # provisions sites, sandboxes, routing, certs
  hosting-api/              # customer/admin API
  sandbox-orchestrator/     # clones snapshots, runs jobs
infra/
  k8s/ or docker-swarm/     # deploy manifests
  storage/                  # ZFS/Ceph notes + scripts
docs/architecture/
  hosting-platform.md
  sandbox-cloning.md

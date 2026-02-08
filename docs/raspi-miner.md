# Raspberry Pi Miner Reference Stack

This doc summarizes the Raspberry Pi reference stack in `miner/raspi/` and how it fits into rewards + integrity.

## Ports

Default ports in the Docker stack:

- **5353/udp + 5353/tcp** — `edge-node` wire-v1 listener (default `DDNS_LISTEN_UDP_PORT` / `DDNS_LISTEN_TCP_PORT`)
- **8080/tcp** — Miner GUI (default `DDNS_GUI_PORT`)

> DNS port 53 is intentionally avoided; add a LAN forwarder if you want classic DNS on 53.

## NVMe Storage

The Pi stack assumes an NVMe HAT mounted at `/mnt/nvme`.

- `/mnt/nvme/ddns/edge_data` → mounted as `/var/lib/ddns` for cached RouteSets/state
- `/mnt/nvme/ddns/state` → integrity + reward status outputs

## Firewall Defaults

Use `miner/raspi/scripts/firewall.sh` (UFW) to apply a LAN-only ingress policy:

- deny incoming, allow outgoing
- allow **SSH 22/tcp**
- allow **wire port 5353 (udp + tcp)** from LAN CIDR
- allow **GUI port 8080/tcp** from LAN CIDR

The script auto-detects LAN CIDR, or accepts `DDNS_LAN_CIDR`.

## GUI + Integrity/Rewards Gating

- **Miner GUI** (`miner/raspi/gui`) is a headless dashboard on port 8080 that reports container health and can auto-restart unhealthy services.
- **Integrity daemon** (`miner/raspi/integrity`) periodically verifies build integrity against the on-chain BuildRegistry and writes:
  - `/mnt/nvme/ddns/state/integrity_status.json`
  - `/mnt/nvme/ddns/state/integrity_report.md`
  - `/mnt/nvme/ddns/state/reward_status.json`

If integrity checks fail, the daemon marks the node **NOT_ELIGIBLE_FOR_REWARDS** until resolved, without blocking boot.

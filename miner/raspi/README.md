# Raspberry Pi Docker Stack (DECENTRALIZED-DNS Miner)

This directory contains the **Raspberry Pi** deployment stack for running DECENTRALIZED-DNS components via **Docker Compose**.

Assumptions:
- Every Raspberry Pi has an **NVMe HAT with 512GB** storage.
- NVMe is mounted at `/mnt/nvme` and used for persistent data.
- You want an always-on edge node that can **cache/serve RouteSets**, optionally **run watchdogs**, and optionally **publish AnchorV1 to IPFS (anchor-only)**.

> Default ports in this stack use **5353** (UDP/TCP) to avoid colliding with DNS port **53**. You can add a LAN DNS forwarder later if you want to serve classic DNS on 53.

---

## What runs on the Pi

### Required
- **edge-node**
  - Stores/caches `RouteSetV1`
  - Speaks `wire-v1` (UDP/TCP)
  - Serves local queries from cache and peers

### Recommended
- **watchdog**
  - Detects poisoning/equivocation
  - Cross-checks network responses against chain commitments (**EVM**)
  - Emits incidents/logs for auditing

### Optional
- **ipfs-anchor** (anchor-only)
  - Publishes/refreshes **AnchorV1 only** to an IPFS gateway/pinner
  - Does **not** store full RouteSets on IPFS by default

---

## Storage (NVMe 512GB)

Persistent data lives on NVMe:

- `/mnt/nvme/ddns/edge_data` → mounted into containers as `/var/lib/ddns`

Create directories:
```bash
sudo mkdir -p /mnt/nvme/ddns/edge_data
sudo chown -R $USER:$USER /mnt/nvme/ddns

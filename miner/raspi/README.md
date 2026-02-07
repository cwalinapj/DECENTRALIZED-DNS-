# Raspberry Pi Docker Stack (DECENTRALIZED-DNS Miner)

This directory contains the **Raspberry Pi** deployment stack for running DECENTRALIZED-DNS components via **Docker Compose**.

Assumptions:
- Every Raspberry Pi has an **NVMe HAT with 512GB** storage.
- NVMe is mounted and used for persistent data (recommended mount: `/mnt/nvme`).
- You want an always-on edge node that can **cache/serve RouteSets**, optionally **run watchdogs**, and optionally **publish AnchorV1 to IPFS (anchor-only)**.

> Default ports in this stack use **5353** (UDP/TCP) to avoid colliding with DNS port **53**. You can add a LAN DNS forwarder later if you want to serve classic DNS on port 53.

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

The stack persists data onto NVMe.

### Recommended mount
- NVMe mount: `/mnt/nvme`

### Data paths
- Edge node persistent state: `/mnt/nvme/ddns/edge_data`

### Set up the NVMe directories
```bash
sudo mkdir -p /mnt/nvme/ddns/edge_data
sudo chown -R $USER:$USER /mnt/nvme/ddns

Docker Compose volume strategy

Option A (recommended): bind-mount NVMe
Edit docker-compose.yml to bind mount:

services:
  edge-node:
    volumes:
      - /mnt/nvme/ddns/edge_data:/var/lib/ddns

Quick Start

1) Install Docker + Compose

On Raspberry Pi OS (64-bit recommended):

curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker version
docker compose version

If group permissions don’t apply immediately, reboot.

⸻

2) Configure environment

Copy the example env file and edit:

cp .env.example .env
nano .env

cp .env.example .env
nano .env

Minimum required (EVM commitments verification):
	•	EVM_RPC_URL
	•	EVM_CHAIN_ID
	•	COMMITMENTS_CONTRACT

If using IPFS anchor-only:
	•	IPFS_GATEWAY_URL
	•	optional IPFS_AUTH_HEADER

⸻

3) Start the stack

From miner/raspi/:

docker compose up -d --build
docker compose ps

view logs
docker compose logs -f edge-node
docker compose logs -f watchdog
docker compose logs -f ipfs-anchor

Networking

Ports
	•	5353/udp — wire-v1 primary transport
	•	5353/tcp — wire-v1 fallback for large responses

Change ports in .env:
	•	DDNS_LISTEN_UDP_PORT
	•	DDNS_LISTEN_TCP_PORT

Joining the network (bootstrap peers)

Configure bootstrap peers in config/edge-node.json (or env vars if supported). Typical pattern:

{
  "bootstrap_peers": ["node1.example:5353", "node2.example:5353"]
}

EVM Commitments (Strong Verification)

This stack is designed to verify served RouteSetV1 objects against chain commitments:
	•	name_id -> (seq, exp, routeset_hash)

Make sure these are correct in .env:
	•	EVM_RPC_URL
	•	EVM_CHAIN_ID
	•	COMMITMENTS_CONTRACT

The watchdog should:
	•	detect mismatches (served hash != chain hash)
	•	detect equivocation (same seq, different hashes across peers)
	•	record incidents

⸻

IPFS Anchor-Only Mode (Optional)

If enabled, ipfs-anchor publishes/refreshes AnchorV1 objects only.

Anchor-only policy:
	•	IPFS stores AnchorV1 (217 bytes) for redundancy
	•	IPFS does not store full RouteSetV1 by default
	•	Full RouteSet IPFS storage is allowed only for explicit “bootstrap mode”

Set in .env:
	•	IPFS_GATEWAY_URL
	•	IPFS_AUTH_HEADER (optional)

⸻
Updating

Pull latest code and rebuild:

cd /path/to/DECENTRALIZED-DNS-/miner/raspi
git pull
docker compose up -d --build

Clean unused images:
docker image prune -f

EVM RPC problems

Confirm:
	•	RPC URL reachable from the Pi
	•	chain id is correct
	•	contract address is correct

⸻

Files in this directory
	•	README.md — this file
	•	docker-compose.yml — services (edge-node, watchdog, ipfs-anchor)
	•	.env.example — environment template
	•	config/edge-node.json — node configuration
	•	config/watchdog.yaml — watchdog configuration
	•	images/*/Dockerfile — per-service images (built locally)


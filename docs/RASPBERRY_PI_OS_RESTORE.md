# Raspberry Pi OS Restore

This is the clean rebuild path for a Raspberry Pi running the local `DECENTRALIZED-DNS-` bump-in-the-wire stack.

Use this when you want to wipe the Pi back to stock Raspberry Pi OS or Debian and restore it from source-controlled setup.

## What this restores

- repo checkout
- Pi deploy config in `deploy/pi/`
- required system packages
- sysctl forwarding
- `nftables`
- `dnsmasq`
- `unbound`
- Docker stack with `gateway` and `caddy`

This path is for the local Pi hub described in [`deploy/pi/README.md`](../deploy/pi/README.md).

## Before wiping the Pi

Save anything that is not already committed to Git:

- `deploy/pi/.env`
- interface names if they differ from defaults
- any local edits in `/etc/nftables.conf`
- any local edits in `/etc/dnsmasq.d/ddns.conf`
- any local edits in `/etc/unbound/unbound.conf.d/ddns.conf`
- any extra systemd units, cron jobs, SSH keys, or mounted disks

Do not assume local state is recoverable unless you captured it first.

## Fresh OS target

Supported target:

- Raspberry Pi OS
- Debian on Raspberry Pi

Assumptions:

- you can `ssh` into the Pi
- the Pi has outbound internet access
- you are restoring from a clean host, not preserving previous package state

## Restore steps

### 1. Install base packages

```bash
sudo apt-get update
sudo apt-get install -y git curl jq nftables dnsmasq unbound docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

### 2. Clone the repo

```bash
cd ~
git clone https://github.com/cwalinapj/DECENTRALIZED-DNS-.git
cd DECENTRALIZED-DNS-
git checkout main
```

### 3. Restore the Pi environment file

```bash
cd ~/DECENTRALIZED-DNS-/deploy/pi
cp .env.example .env
```

Edit `.env` for the real host:

- `WAN_IF`
- `LAN_IF`
- `LAN_CIDR`
- `LAN_IP`
- `LAN_NET`
- `DHCP_RANGE_START`
- `DHCP_RANGE_END`

The defaults assume:

- WAN on `eth0`
- LAN on `eth1`
- local segment `192.168.50.0/24`

If your USB Ethernet adapter shows up as `enx...`, use that actual name.

### 4. Apply host networking and DNS config

```bash
cd ~/DECENTRALIZED-DNS-/deploy/pi
bash install.sh
```

That script:

- installs required host packages
- enables IP forwarding
- installs `nftables`
- installs `dnsmasq`
- installs `unbound`

### 5. Start the Docker services

```bash
cd ~/DECENTRALIZED-DNS-/deploy/pi
sudo docker compose up -d --build
```

## Validate after restore

Check host services:

```bash
systemctl status nftables dnsmasq unbound docker --no-pager
```

Check containers:

```bash
sudo docker compose -f ~/DECENTRALIZED-DNS-/deploy/pi/docker-compose.yml ps
curl http://127.0.0.1:8054/healthz
```

Check the HTTPS front door from the Pi:

```bash
curl -k https://127.0.0.1/healthz
```

## Common failure points

- wrong `WAN_IF` or `LAN_IF` values
- `.env` restored with stale subnet values
- Docker not enabled after package install
- existing host firewall rules conflicting with `nftables`
- a custom resolver already binding port `53`

## Source of truth

The committed restore path lives in:

- `deploy/pi/install.sh`
- `deploy/pi/.env.example`
- `deploy/pi/docker-compose.yml`
- `deploy/pi/dnsmasq.conf`
- `deploy/pi/unbound.conf`
- `deploy/pi/nftables.conf`
- `deploy/pi/sysctl.conf`

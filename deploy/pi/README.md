# Pi deploy (bump-in-the-wire)

This folder contains a self-contained "Pi hub" deployment:
- host routing/NAT + firewall (nftables)
- DHCP + DNS forwarding (dnsmasq)
- caching resolver (unbound)
- DDNS gateway + Caddy in Docker

Start here after cloning the repo on the Pi:
1) cp .env.example .env && edit WAN_IF/LAN_IF
2) run install.sh
3) docker compose up -d --build

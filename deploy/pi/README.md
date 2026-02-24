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

## Optional: Jive autopilot + watchdog timers

To enable automated sandbox PR/deploy loop and watchdog checks:

```bash
sudo cp deploy/pi/systemd/jive-autopilot.service /etc/systemd/system/
sudo cp deploy/pi/systemd/jive-autopilot.timer /etc/systemd/system/
sudo cp deploy/pi/systemd/jive-watchdog.service /etc/systemd/system/
sudo cp deploy/pi/systemd/jive-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jive-autopilot.timer
sudo systemctl enable --now jive-watchdog.timer
```

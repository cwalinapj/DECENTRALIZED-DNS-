#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y pdns-server pdns-backend-sqlite3 sqlite3 dnsutils

# Disable bind backend if present
if [ -f /etc/powerdns/pdns.d/bind.conf ]; then
  sudo mv /etc/powerdns/pdns.d/bind.conf /etc/powerdns/pdns.d/bind.conf.disabled
fi

# Ensure sqlite backend
sudo tee /etc/powerdns/pdns.d/00-backend.conf >/dev/null <<'PDNS_BACKEND'
launch=gsqlite3
gsqlite3-database=/var/lib/powerdns/pdns.sqlite3
PDNS_BACKEND

# Listen on public interfaces; allow queries
sudo tee /etc/powerdns/pdns.d/00-listen.conf >/dev/null <<'PDNS_LISTEN'
local-address=0.0.0.0,::
# NOTE: some pdns versions do NOT support allow-from (you hit this once).
# So we avoid it and rely on firewall rules instead.
disable-axfr=yes
PDNS_LISTEN

# Initialize schema if DB missing/empty
sudo bash -lc 'test -s /var/lib/powerdns/pdns.sqlite3 || sqlite3 /var/lib/powerdns/pdns.sqlite3 < /usr/share/pdns-backend-sqlite3/schema/schema.sqlite3.sql'

sudo chown -R pdns:pdns /var/lib/powerdns
sudo chmod 750 /var/lib/powerdns
sudo chmod 640 /var/lib/powerdns/pdns.sqlite3

sudo systemctl enable --now pdns
sudo systemctl restart pdns
sudo systemctl --no-pager -l status pdns | sed -n '1,40p'

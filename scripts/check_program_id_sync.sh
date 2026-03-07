#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOLANA_DIR="$ROOT/solana"
ANCHOR_TOML="$SOLANA_DIR/Anchor.toml"
DEPLOY_DIR="$SOLANA_DIR/target/deploy"

if [ ! -f "$ANCHOR_TOML" ]; then
  echo "[id-check] missing $ANCHOR_TOML" >&2
  exit 1
fi
if [ ! -d "$DEPLOY_DIR" ]; then
  echo "[id-check] missing $DEPLOY_DIR (run anchor build first)" >&2
  exit 1
fi

python3 - "$ANCHOR_TOML" "$DEPLOY_DIR" "$SOLANA_DIR/programs" <<'PY'
import json, os, re, subprocess, sys
from pathlib import Path

anchor_toml = Path(sys.argv[1])
deploy_dir = Path(sys.argv[2])
programs_dir = Path(sys.argv[3])

# parse [programs.devnet]
anchor_ids = {}
section = None
for line in anchor_toml.read_text().splitlines():
    s = line.strip()
    if s.startswith("[") and s.endswith("]"):
        section = s
        continue
    if section == "[programs.devnet]" and "=" in line:
        k, v = [x.strip() for x in line.split("=", 1)]
        anchor_ids[k] = v.strip('"')

errors = []
warnings = []
rows = []
for prog, anchor_id in sorted(anchor_ids.items()):
    kp = deploy_dir / f"{prog}-keypair.json"
    lib = programs_dir / prog / "src/lib.rs"
    keypair_id = None
    if kp.exists():
        keypair_id = subprocess.check_output(["solana-keygen", "pubkey", str(kp)], text=True).strip()

    if not lib.exists():
        errors.append(f"{prog}: missing declare file {lib}")
        continue
    txt = lib.read_text()
    m = re.search(r'declare_id!\("([^"]+)"\);', txt)
    declare_id = m.group(1) if m else None
    if not declare_id:
        errors.append(f"{prog}: declare_id! not found in {lib}")
        continue

    if anchor_id != declare_id:
        errors.append(f"{prog}: Anchor.toml ({anchor_id}) != declare_id ({declare_id})")

    rows.append((prog, keypair_id, anchor_id, declare_id))
    if keypair_id and keypair_id not in (anchor_id, declare_id):
        warnings.append(
            f"{prog}: build keypair ({keypair_id}) differs from canonical "
            f"Anchor.toml/declare_id ({anchor_id}); target/deploy keypairs are local build artifacts"
        )

print("[id-check] Program ID sync report")
for prog, kp, an, dec in rows:
    print(f"- {prog}: keypair={kp} anchor={an} declare={dec}")

if errors:
    print("[id-check] FAIL")
    for e in errors:
        print("  -", e)
    sys.exit(1)

if warnings:
    print("[id-check] WARN")
    for w in warnings:
        print("  -", w)

print("[id-check] PASS")
PY

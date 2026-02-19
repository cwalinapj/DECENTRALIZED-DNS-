#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANCHOR_TOML="$ROOT/solana/Anchor.toml"
DEPLOY_DIR="$ROOT/solana/target/deploy"

python3 - "$ANCHOR_TOML" "$DEPLOY_DIR" "$ROOT/solana/programs" <<'PY'
import re
import subprocess
import sys
from pathlib import Path
import tomllib

anchor_path=Path(sys.argv[1])
deploy_dir=Path(sys.argv[2])
programs_dir=Path(sys.argv[3])

cfg=tomllib.loads(anchor_path.read_text())
dev=cfg.get('programs',{}).get('devnet',{})
loc=cfg.get('programs',{}).get('localnet',{})

if not dev:
    print('ERROR: no [programs.devnet] entries found', file=sys.stderr)
    sys.exit(1)

mismatches=[]
print('program,declare_id,anchor_devnet,anchor_localnet,keypair_pubkey,status')
for prog in sorted(dev.keys()):
    kp=deploy_dir/f'{prog}-keypair.json'
    kpub='MISSING'
    if kp.exists():
      try:
        kpub=subprocess.check_output(['solana-keygen','pubkey',str(kp)], text=True).strip()
      except Exception:
        kpub='MISSING'
    lib=programs_dir/prog/'src/lib.rs'
    dec='MISSING'
    if lib.exists():
      m=re.search(r'declare_id!\("([1-9A-HJ-NP-Za-km-z]{32,44})"\)', lib.read_text())
      if m:
          dec=m.group(1)
    status='OK'
    if kpub == 'MISSING' or dec != kpub or str(dev.get(prog,'')) != kpub or str(loc.get(prog,'')) != kpub:
      status='MISMATCH'
      mismatches.append(prog)
    print(f'{prog},{dec},{dev.get(prog,"")},{loc.get(prog,"")},{kpub},{status}')

if mismatches:
    print('\nERROR: Program ID mismatch detected for: ' + ', '.join(mismatches), file=sys.stderr)
    sys.exit(1)

print('\nOK: declare_id, Anchor.toml (devnet/localnet), and deploy keypair pubkeys are in sync.')
PY

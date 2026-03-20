#!/usr/bin/env python3
import glob
import json
import os
import re
import subprocess
import sys


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOLANA_ROOT = os.path.join(REPO_ROOT, "solana")
ANCHOR_TOML = os.path.join(SOLANA_ROOT, "Anchor.toml")
PINNED_JSON = os.path.join(SOLANA_ROOT, "program_ids.json")


def parse_anchor_programs():
    with open(ANCHOR_TOML, "r", encoding="utf-8") as f:
        content = f.read().splitlines()
    sections = {"[programs.devnet]": {}, "[programs.localnet]": {}}
    current = None
    for raw in content:
        line = raw.strip()
        if line.startswith("[") and line.endswith("]"):
            current = line
            continue
        if current not in sections or "=" not in line:
            continue
        key, value = [part.strip() for part in line.split("=", 1)]
        sections[current][key] = value.strip('"')
    return sections


def read_declare_id(lib_rs_path):
    with open(lib_rs_path, "r", encoding="utf-8") as f:
        content = f.read()
    match = re.search(r'declare_id!\("([^"]+)"\)', content)
    return match.group(1) if match else None


def deploy_keypair_pubkey(program):
    keypair_path = os.path.join(SOLANA_ROOT, "target", "deploy", f"{program}-keypair.json")
    if not os.path.exists(keypair_path):
        return None
    return subprocess.check_output(["solana-keygen", "pubkey", keypair_path], text=True).strip()


def main():
    with open(PINNED_JSON, "r", encoding="utf-8") as f:
        pinned = json.load(f)
    anchor_sections = parse_anchor_programs()

    mismatches = []
    for lib_rs in sorted(glob.glob(os.path.join(SOLANA_ROOT, "programs", "*", "src", "lib.rs"))):
        program = os.path.basename(os.path.dirname(os.path.dirname(lib_rs)))
        expected = pinned.get(program)
        declared = read_declare_id(lib_rs)
        devnet = anchor_sections["[programs.devnet]"].get(program)
        localnet = anchor_sections["[programs.localnet]"].get(program)
        deploy = deploy_keypair_pubkey(program)
        values = {
            "program": program,
            "pinned": expected,
            "declare_id": declared,
            "anchor_devnet": devnet,
            "anchor_localnet": localnet,
            "deploy_keypair": deploy,
        }
        if len({expected, declared, devnet, localnet, deploy}) != 1:
            mismatches.append(values)

    if mismatches:
        print(json.dumps({"ok": False, "mismatches": mismatches}, indent=2))
        return 1

    print(json.dumps({"ok": True, "program_ids": pinned}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

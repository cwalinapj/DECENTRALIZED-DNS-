#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    store: "settlement/anchors/anchors.json",
    source: "local"
  };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !value) continue;
    if (key === "--root") out.root = value;
    if (key === "--version") out.version = Number(value);
    if (key === "--timestamp") out.timestamp = value;
    if (key === "--source") out.source = value;
    if (key === "--store") out.store = value;
  }
  return out;
}

const opts = parseArgs();
if (!opts.root || !opts.version || !opts.timestamp) {
  console.error("Usage: --root <hex> --version <n> --timestamp <iso> [--source <id>] [--store path]");
  process.exit(1);
}

const store = fs.existsSync(opts.store)
  ? JSON.parse(fs.readFileSync(opts.store, "utf8"))
  : { latest: null, history: [] };

const record = {
  root: opts.root,
  version: opts.version,
  timestamp: opts.timestamp,
  source: opts.source
};

store.latest = record;
store.history = [record, ...(store.history || [])].slice(0, 1000);

fs.mkdirSync(path.dirname(opts.store), { recursive: true });
fs.writeFileSync(opts.store, JSON.stringify(store, null, 2) + "\n");
console.log(JSON.stringify({ anchored: record }, null, 2));

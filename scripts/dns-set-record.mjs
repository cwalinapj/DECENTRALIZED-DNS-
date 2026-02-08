#!/usr/bin/env node
import { loadSnapshot, saveSnapshot, normalizeName, recordMessage, verifySignature } from "./registry-utils.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    registry: "registry/snapshots/registry.json",
    ttl: 300,
    version: 1
  };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !value) continue;
    if (key === "--registry") out.registry = value;
    if (key === "--name") out.name = value;
    if (key === "--type") out.type = value;
    if (key === "--value") out.value = value;
    if (key === "--ttl") out.ttl = Number(value);
    if (key === "--owner") out.owner = value;
    if (key === "--sig") out.sig = value;
  }
  return out;
}

const opts = parseArgs();
if (!opts.name || !opts.type || !opts.value || !opts.owner || !opts.sig) {
  console.error("Usage: --name NAME --type TYPE --value VALUE --owner PUBKEY_HEX --sig SIG_HEX [--ttl N] [--registry path]");
  process.exit(1);
}

const snapshot = loadSnapshot(opts.registry);
const normalized = normalizeName(opts.name);
const updatedAt = new Date().toISOString();
const record = {
  name: normalized,
  owner: opts.owner,
  version: 1,
  updatedAt,
  records: [{ type: opts.type, value: opts.value, ttl: opts.ttl }]
};

const message = recordMessage(record);
const verified = await verifySignature(opts.owner, message, opts.sig);
if (!verified) {
  console.error("signature verification failed");
  process.exit(1);
}

const existing = snapshot.records.findIndex((entry) => normalizeName(entry.name) === normalized);
if (existing >= 0) {
  snapshot.records[existing] = record;
} else {
  snapshot.records.push(record);
}

snapshot.updatedAt = updatedAt;

saveSnapshot(opts.registry, snapshot);
console.log("ok");

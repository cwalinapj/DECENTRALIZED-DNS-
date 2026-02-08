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
    if (key === "--nonce") out.nonce = Number(value);
    if (key === "--updated-at") out.updatedAt = value;
    if (key === "--version") out.version = Number(value);
  }
  return out;
}

const opts = parseArgs();
if (!opts.name || !opts.type || !opts.value || !opts.owner || !opts.sig || typeof opts.nonce !== "number") {
  console.error("Usage: --name NAME --type TYPE --value VALUE --owner PUBKEY --sig SIG --nonce N [--ttl N] [--registry path]");
  process.exit(1);
}

const snapshot = loadSnapshot(opts.registry);
const normalized = normalizeName(opts.name);
const updatedAt = opts.updatedAt || new Date().toISOString();
const record = {
  name: normalized,
  owner: opts.owner,
  version: opts.version || 1,
  updatedAt,
  records: [
    { type: "OWNER", value: opts.owner },
    { type: opts.type, value: opts.value, ttl: opts.ttl }
  ]
};

const message = recordMessage({
  name: record.name,
  owner: record.owner,
  version: record.version,
  updatedAt: record.updatedAt,
  nonce: opts.nonce,
  records: record.records
});
const verified = await verifySignature(opts.owner, message, opts.sig);
if (!verified) {
  console.error("signature verification failed");
  process.exit(1);
}

const existing = snapshot.records.findIndex((entry) => normalizeName(entry.name) === normalized);
if (existing >= 0) {
  const current = snapshot.records[existing];
  const currentOwner = current.records.find((entry) => String(entry.type).toUpperCase() === "OWNER");
  if (currentOwner && String(currentOwner.value) !== opts.owner) {
    console.error("owner mismatch with current registry record");
    process.exit(1);
  }
}
if (existing >= 0) {
  snapshot.records[existing] = record;
} else {
  snapshot.records.push(record);
}

snapshot.updatedAt = updatedAt;

saveSnapshot(opts.registry, snapshot);
console.log("ok");

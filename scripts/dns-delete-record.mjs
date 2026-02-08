#!/usr/bin/env node
import { loadSnapshot, saveSnapshot, normalizeName, deleteMessage, verifySignature } from "./registry-utils.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    registry: "registry/snapshots/registry.json"
  };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !value) continue;
    if (key === "--registry") out.registry = value;
    if (key === "--name") out.name = value;
    if (key === "--owner") out.owner = value;
    if (key === "--sig") out.sig = value;
  }
  return out;
}

const opts = parseArgs();
if (!opts.name || !opts.owner || !opts.sig) {
  console.error("Usage: --name NAME --owner PUBKEY_HEX --sig SIG_HEX [--registry path]");
  process.exit(1);
}

const snapshot = loadSnapshot(opts.registry);
const normalized = normalizeName(opts.name);
const updatedAt = new Date().toISOString();
const message = deleteMessage(normalized, updatedAt);
const verified = await verifySignature(opts.owner, message, opts.sig);
if (!verified) {
  console.error("signature verification failed");
  process.exit(1);
}

snapshot.records = snapshot.records.filter((entry) => normalizeName(entry.name) !== normalized);
snapshot.updatedAt = updatedAt;

saveSnapshot(opts.registry, snapshot);
console.log("ok");

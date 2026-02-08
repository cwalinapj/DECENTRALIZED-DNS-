#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import punycode from "punycode";

function normalizeName(name) {
  const trimmed = name.trim().replace(/\.$/, "");
  return punycode.toASCII(trimmed.toLowerCase());
}

function canonicalizeRecord(record) {
  const normalized = {
    name: normalizeName(record.name),
    owner: record.owner || undefined,
    version: record.version,
    updatedAt: record.updatedAt,
    records: [...record.records]
      .map((entry) => ({
        type: String(entry.type).toUpperCase(),
        value: String(entry.value),
        ttl: entry.ttl
      }))
      .sort((a, b) => {
        const keyA = `${a.type}|${a.value}|${a.ttl ?? ""}`;
        const keyB = `${b.type}|${b.value}|${b.ttl ?? ""}`;
        return keyA.localeCompare(keyB);
      })
  };

  const payload = {
    name: normalized.name,
    records: normalized.records,
    version: normalized.version,
    updatedAt: normalized.updatedAt
  };

  if (normalized.owner) {
    payload.owner = normalized.owner;
  }

  return JSON.stringify(payload);
}

function hashLeaf(record) {
  const canonical = canonicalizeRecord(record);
  const name = normalizeName(record.name);
  const input = `${name}\n${canonical}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

function buildLeaves(records) {
  return [...records]
    .map((record) => ({ name: normalizeName(record.name), hash: hashLeaf(record) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildTree(leaves) {
  const layers = [];
  let level = leaves.map((leaf) => leaf.hash);
  layers.push(level);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(crypto.createHash("sha256").update(left + right).digest("hex"));
    }
    level = next;
    layers.push(level);
  }
  return layers;
}

function buildProof(records, name) {
  const normalized = normalizeName(name);
  const leaves = buildLeaves(records);
  const tree = buildTree(leaves);
  const index = leaves.findIndex((leaf) => leaf.name === normalized);
  if (index === -1) {
    return { leaf: "", proof: [], root: tree.at(-1)?.[0] ?? "" };
  }
  const proof = [];
  let idx = index;
  for (let level = 0; level < tree.length - 1; level += 1) {
    const layer = tree[level];
    const isRight = idx % 2 === 1;
    const pairIndex = isRight ? idx - 1 : idx + 1;
    const pairHash = layer[pairIndex] ?? layer[idx];
    proof.push({ hash: pairHash, position: isRight ? "left" : "right" });
    idx = Math.floor(idx / 2);
  }
  return { leaf: leaves[index].hash, proof, root: tree.at(-1)?.[0] ?? "" };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { input: "registry/snapshots/registry.json", name: "" };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !value) continue;
    if (key === "--input") out.input = value;
    if (key === "--name") out.name = value;
    if (key === "--out-root") out.outRoot = value;
    if (key === "--out-proof") out.outProof = value;
    if (key === "--out-snapshot") out.outSnapshot = value;
  }
  return out;
}

const opts = parseArgs();
const snapshot = JSON.parse(fs.readFileSync(opts.input, "utf8"));
const records = snapshot.records || [];
const root = buildTree(buildLeaves(records)).at(-1)?.[0] ?? crypto.createHash("sha256").update("").digest("hex");
let proof = null;
if (opts.name) {
  proof = buildProof(records, opts.name);
}

const output = {
  root,
  version: snapshot.version,
  updatedAt: snapshot.updatedAt,
  proof
};

if (opts.outSnapshot) {
  fs.writeFileSync(opts.outSnapshot, JSON.stringify(snapshot, null, 2) + "\n");
}
if (opts.outRoot) {
  fs.writeFileSync(opts.outRoot, JSON.stringify({ root, version: snapshot.version, updatedAt: snapshot.updatedAt }, null, 2) + "\n");
}
if (opts.outProof && proof) {
  fs.writeFileSync(opts.outProof, JSON.stringify(proof, null, 2) + "\n");
}

process.stdout.write(JSON.stringify(output, null, 2) + "\n");

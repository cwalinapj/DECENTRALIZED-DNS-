import fs from "node:fs";
import path from "node:path";
import punycode from "punycode";
import { hash as blake3 } from "blake3";

export type RegistryRecord = {
  name: string;
  records: Array<{ type: string; value: string | { key: string; value: string }; ttl?: number }>;
  version: number;
  updatedAt: string;
  owner?: string;
};

export type RegistrySnapshot = {
  version: number;
  updatedAt: string;
  records: RegistryRecord[];
};

export type MerkleProof = { siblings: string[]; directions: Array<"left" | "right"> };

const DEFAULT_REGISTRY_PATH = path.resolve(process.cwd(), "registry/snapshots/registry.json");
const CACHE_TTL_MS = 2000;
const ALLOWED_TYPES = new Set(["OWNER", "NODE_PUBKEY", "ENDPOINT", "CAPS", "TEXT"]);
const ALLOWED_CAPS = new Set(["cache", "verify", "store", "proxy", "tor"]);

let cached: { loadedAt: number; snapshot: RegistrySnapshot } | null = null;

export function normalizeName(name: string): string {
  const trimmed = name.trim().replace(/\.$/, "");
  const lowered = trimmed.toLowerCase();
  return punycode.toASCII(lowered);
}

export function loadSnapshot(registryPath = DEFAULT_REGISTRY_PATH): RegistrySnapshot {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.snapshot;
  }
  const raw = fs.readFileSync(registryPath, "utf8");
  const snapshot = JSON.parse(raw) as RegistrySnapshot;
  validateSnapshot(snapshot);
  cached = { loadedAt: Date.now(), snapshot };
  return snapshot;
}

export function canonicalizeRecord(record: RegistryRecord): string {
  const normalizedName = normalizeName(record.name);
  const normalizedRecords = normalizeRecordEntries(record.records);

  const payload: Record<string, unknown> = {
    name: normalizedName,
    version: record.version,
    updatedAt: record.updatedAt,
    records: normalizedRecords
  };

  if (record.owner) payload.owner = record.owner;
  return JSON.stringify(payload);
}

export function hashLeaf(record: RegistryRecord): string {
  const canonical = canonicalizeRecord(record);
  const name = normalizeName(record.name);
  const input = `${name}\n${canonical}`;
  return bytesToHex(blake3(new TextEncoder().encode(input)));
}

export function buildMerkleRoot(records: RegistryRecord[]): string {
  const tree = buildTree(buildLeaves(records));
  return tree.at(-1)?.[0] ?? bytesToHex(blake3(new TextEncoder().encode("")));
}

export function buildProof(records: RegistryRecord[], name: string): { leaf: string; proof: MerkleProof; root: string } {
  const normalized = normalizeName(name);
  const leaves = buildLeaves(records);
  const tree = buildTree(leaves);
  const index = leaves.findIndex((leaf) => leaf.name === normalized);
  if (index === -1) {
    return { leaf: "", proof: { siblings: [], directions: [] }, root: tree.at(-1)?.[0] ?? "" };
  }
  const siblings: string[] = [];
  const directions: Array<"left" | "right"> = [];
  let idx = index;
  for (let level = 0; level < tree.length - 1; level += 1) {
    const layer = tree[level];
    const isRight = idx % 2 === 1;
    const pairIndex = isRight ? idx - 1 : idx + 1;
    const pairHash = layer[pairIndex] ?? layer[idx];
    siblings.push(pairHash);
    directions.push(isRight ? "left" : "right");
    idx = Math.floor(idx / 2);
  }
  return { leaf: leaves[index].hash, proof: { siblings, directions }, root: tree.at(-1)?.[0] ?? "" };
}

export function verifyProof(root: string, leaf: string, proof: MerkleProof): boolean {
  let computed = leaf;
  for (let i = 0; i < proof.siblings.length; i += 1) {
    const sibling = proof.siblings[i];
    const dir = proof.directions[i];
    const combined = dir === "left" ? `${sibling}${computed}` : `${computed}${sibling}`;
    computed = bytesToHex(blake3(new TextEncoder().encode(combined)));
  }
  return computed === root;
}

function buildLeaves(records: RegistryRecord[]): Array<{ name: string; hash: string }> {
  return [...records]
    .map((record) => ({ name: normalizeName(record.name), hash: hashLeaf(record) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildTree(leaves: Array<{ name: string; hash: string }>): string[][] {
  const layers: string[][] = [];
  let level = leaves.map((leaf) => leaf.hash);
  layers.push(level);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(bytesToHex(blake3(new TextEncoder().encode(left + right))));
    }
    level = next;
    layers.push(level);
  }
  return layers;
}

function normalizeRecordEntries(records: RegistryRecord["records"]) {
  if (!records.length || !records.some((entry) => entry.type.toUpperCase() === "OWNER")) {
    throw new Error("OWNER record required");
  }
  const normalized = records.map((entry) => {
    const type = entry.type.toUpperCase();
    if (!ALLOWED_TYPES.has(type)) {
      throw new Error(`unsupported record type ${type}`);
    }
    if (type === "TEXT") {
      if (typeof entry.value !== "object" || entry.value === null) {
        throw new Error("TEXT record must be {key,value}");
      }
      const valueObj = entry.value as { key: string; value: string };
      if (!valueObj.key || !valueObj.value) throw new Error("TEXT record requires key/value");
      return { type, key: valueObj.key, value: valueObj.value, ttl: entry.ttl };
    }
    if (type === "ENDPOINT") {
      if (typeof entry.value !== "string") throw new Error("ENDPOINT must be string");
      const url = new URL(entry.value);
      if (url.protocol !== "https:") throw new Error("ENDPOINT must be https");
      return { type, key: "", value: entry.value, ttl: entry.ttl };
    }
    if (type === "NODE_PUBKEY") {
      if (typeof entry.value !== "string") throw new Error("NODE_PUBKEY must be string");
      if (!entry.value.startsWith("ed25519:")) throw new Error("NODE_PUBKEY must be ed25519:<base64>");
      return { type, key: "", value: entry.value, ttl: entry.ttl };
    }
    if (type === "CAPS") {
      if (typeof entry.value !== "string") throw new Error("CAPS must be string");
      const caps = entry.value.split(",").map((cap) => cap.trim().toLowerCase()).filter(Boolean);
      for (const cap of caps) {
        if (!ALLOWED_CAPS.has(cap)) throw new Error(`unsupported cap ${cap}`);
      }
      const value = Array.from(new Set(caps)).sort().join(",");
      return { type, key: "", value, ttl: entry.ttl };
    }
    if (typeof entry.value !== "string" || !entry.value) {
      throw new Error(`${type} must be non-empty string`);
    }
    return { type, key: "", value: entry.value, ttl: entry.ttl };
  });

  return normalized.sort((a, b) => {
    const keyA = `${a.type}|${a.key}|${a.value}`;
    const keyB = `${b.type}|${b.key}|${b.value}`;
    return keyA.localeCompare(keyB);
  });
}

function validateSnapshot(snapshot: RegistrySnapshot) {
  snapshot.records.forEach((record) => {
    const normalized = normalizeName(record.name);
    if (!normalized.endsWith(".dns")) throw new Error(`invalid name ${record.name}`);
    normalizeRecordEntries(record.records);
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

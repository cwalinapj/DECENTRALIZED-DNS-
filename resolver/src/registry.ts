import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import punycode from "punycode";

export type RegistryRecord = {
  name: string;
  records: Array<{ type: string; value: string; ttl?: number }>;
  version: number;
  updatedAt: string;
  owner?: string;
};

export type RegistrySnapshot = {
  version: number;
  updatedAt: string;
  records: RegistryRecord[];
};

export type MerkleProof = Array<{ hash: string; position: "left" | "right" }>;

const DEFAULT_REGISTRY_PATH = path.resolve(process.cwd(), "registry/snapshots/registry.json");
const CACHE_TTL_MS = 2000;
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
  cached = { loadedAt: Date.now(), snapshot };
  return snapshot;
}

export function canonicalizeRecord(record: RegistryRecord): string {
  const normalized = {
    name: normalizeName(record.name),
    owner: record.owner || undefined,
    version: record.version,
    updatedAt: record.updatedAt,
    records: [...record.records]
      .map((entry) => ({
        type: entry.type.toUpperCase(),
        value: entry.value,
        ttl: entry.ttl
      }))
      .sort((a, b) => {
        const keyA = `${a.type}|${a.value}|${a.ttl ?? ""}`;
        const keyB = `${b.type}|${b.value}|${b.ttl ?? ""}`;
        return keyA.localeCompare(keyB);
      })
  };

  const payload: Record<string, unknown> = {
    name: normalized.name,
    records: normalized.records,
    version: normalized.version,
    updatedAt: normalized.updatedAt
  };

  if (normalized.owner) payload.owner = normalized.owner;

  return JSON.stringify(payload);
}

export function hashLeaf(record: RegistryRecord): string {
  const canonical = canonicalizeRecord(record);
  const name = normalizeName(record.name);
  const input = `${name}\n${canonical}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function buildMerkleRoot(records: RegistryRecord[]): string {
  const tree = buildTree(buildLeaves(records));
  return tree.at(-1)?.[0] ?? crypto.createHash("sha256").update("").digest("hex");
}

export function buildProof(records: RegistryRecord[], name: string): { leaf: string; proof: MerkleProof; root: string } {
  const normalized = normalizeName(name);
  const leaves = buildLeaves(records);
  const tree = buildTree(leaves);
  const index = leaves.findIndex((leaf) => leaf.name === normalized);
  if (index === -1) {
    return { leaf: "", proof: [], root: tree.at(-1)?.[0] ?? "" };
  }
  const proof: MerkleProof = [];
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

export function verifyProof(root: string, leaf: string, proof: MerkleProof): boolean {
  let computed = leaf;
  for (const step of proof) {
    const combined = step.position === "left" ? `${step.hash}${computed}` : `${computed}${step.hash}`;
    computed = crypto.createHash("sha256").update(combined).digest("hex");
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
      next.push(crypto.createHash("sha256").update(left + right).digest("hex"));
    }
    level = next;
    layers.push(level);
  }
  return layers;
}

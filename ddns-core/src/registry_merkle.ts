import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
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

export function normalizeRegistryName(name: string): string {
  const trimmed = name.trim().replace(/\.$/, "");
  const lowered = trimmed.toLowerCase();
  return punycode.toASCII(lowered);
}

export function canonicalizeRecord(record: RegistryRecord): string {
  const normalized = {
    name: normalizeRegistryName(record.name),
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

  if (normalized.owner) {
    payload.owner = normalized.owner;
  }

  return JSON.stringify(payload);
}

export function hashLeaf(record: RegistryRecord): string {
  const canonical = canonicalizeRecord(record);
  const name = normalizeRegistryName(record.name);
  const input = `${name}\n${canonical}`;
  return bytesToHex(sha256(utf8ToBytes(input)));
}

export function buildMerkleRoot(records: RegistryRecord[]): string {
  const leaves = buildLeaves(records);
  if (leaves.length === 0) {
    return bytesToHex(sha256(utf8ToBytes("")));
  }
  return buildTree(leaves).at(-1)?.[0] ?? "";
}

export function buildProof(records: RegistryRecord[], name: string): { leaf: string; proof: MerkleProof; root: string } {
  const normalized = normalizeRegistryName(name);
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
    const combined = step.position === "left"
      ? `${step.hash}${computed}`
      : `${computed}${step.hash}`;
    computed = bytesToHex(sha256(utf8ToBytes(combined)));
  }
  return computed === root;
}

function buildLeaves(records: RegistryRecord[]): Array<{ name: string; hash: string }> {
  return [...records]
    .map((record) => ({ name: normalizeRegistryName(record.name), hash: hashLeaf(record) }))
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
      const combined = `${left}${right}`;
      next.push(bytesToHex(sha256(utf8ToBytes(combined))));
    }
    level = next;
    layers.push(level);
  }
  return layers;
}

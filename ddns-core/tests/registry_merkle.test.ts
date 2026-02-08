import { describe, it, expect } from "vitest";
import { buildMerkleRoot, buildProof, verifyProof, type RegistryRecord } from "../src/registry_merkle.js";

const records: RegistryRecord[] = [
  {
    name: "alice.dns",
    owner: "owner1",
    version: 1,
    updatedAt: "2026-02-01T00:00:00Z",
    records: [{ type: "TXT", value: "ipfs://example", ttl: 300 }]
  },
  {
    name: "bob.dns",
    owner: "owner2",
    version: 1,
    updatedAt: "2026-02-01T00:00:00Z",
    records: [{ type: "A", value: "203.0.113.5", ttl: 60 }]
  }
];

describe("registry merkle", () => {
  it("builds deterministic root", () => {
    const root1 = buildMerkleRoot(records);
    const root2 = buildMerkleRoot(records);
    expect(root1).toBe(root2);
    expect(root1.length).toBeGreaterThan(0);
  });

  it("verifies proof for a record", () => {
    const { root, leaf, proof } = buildProof(records, "alice.dns");
    expect(leaf.length).toBeGreaterThan(0);
    expect(verifyProof(root, leaf, proof)).toBe(true);
  });
});

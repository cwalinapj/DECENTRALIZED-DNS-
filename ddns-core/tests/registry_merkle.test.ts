import { describe, it, expect } from "vitest";
import { buildMerkleRoot, buildProof, verifyProof, canonicalizeRecord, normalizeRegistryName, type RegistryRecord } from "../src/registry_merkle.js";

const records: RegistryRecord[] = [
  {
    name: "alice.dns",
    owner: "ed25519:YWJj",
    version: 1,
    updatedAt: "2026-02-01T00:00:00Z",
    records: [
      { type: "OWNER", value: "ed25519:YWJj" },
      { type: "NODE_PUBKEY", value: "ed25519:YWJj" },
      { type: "ENDPOINT", value: "https://example.com" },
      { type: "CAPS", value: "cache,verify" },
      { type: "TEXT", value: { key: "email", value: "alice@example.com" }, ttl: 300 }
    ]
  },
  {
    name: "bob.dns",
    owner: "ed25519:ZGVm",
    version: 1,
    updatedAt: "2026-02-01T00:00:00Z",
    records: [
      { type: "OWNER", value: "ed25519:ZGVm" },
      { type: "ENDPOINT", value: "https://example.org" }
    ]
  }
];

describe("registry merkle", () => {
  it("normalizes names deterministically", () => {
    expect(normalizeRegistryName("Alice.DNS.")).toBe("alice.dns");
  });

  it("canonicalizes record deterministically", () => {
    const record = records[0];
    const first = canonicalizeRecord(record);
    const second = canonicalizeRecord(record);
    expect(first).toBe(second);
  });

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

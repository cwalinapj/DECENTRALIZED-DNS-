import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { buildMerkleRoot, buildProof, hashLeaf, verifyProof } from "../../../../../ddns-core/dist/src/registry_merkle.js";

const snapshotPath = path.resolve(process.cwd(), "../../../registry/snapshots/registry.json");
const raw = fs.readFileSync(snapshotPath, "utf8");
const snapshot = JSON.parse(raw);

const record = snapshot.records[0];
const root = buildMerkleRoot(snapshot.records);
const proof = buildProof(snapshot.records, record.name);
const leaf = hashLeaf(record);

assert.strictEqual(leaf, proof.leaf);
assert.strictEqual(root, proof.root);
assert.strictEqual(verifyProof(root, leaf, proof.proof), true);

console.log("node verify proof fixture passed");

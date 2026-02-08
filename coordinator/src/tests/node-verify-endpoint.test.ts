import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { buildMerkleRoot, buildProof } from "../../../core/dist/src/registry_merkle.js";
import { computeResolveResultHash } from "../../../core/dist/src/resolve_hash.js";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

async function signAuthority(privHex: string, resultHash: string): Promise<string> {
  const msg = new TextEncoder().encode(`resolve\n${resultHash}`);
  const sig = await ed.sign(msg, privHex);
  return bytesToHex(sig);
}

async function startServer() {
  const { createCreditsServer } = await import("../server.js");
  const server = createCreditsServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server_address_missing");
  return { server, port: address.port };
}

async function postJson(port: number, pathName: string, body: unknown, headers: Record<string, string>) {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const payload = await res.json();
  return { status: res.status, payload };
}

async function run() {
  const snapshotPath = path.resolve(process.cwd(), "..", "registry/snapshots/registry.json");
  const raw = fs.readFileSync(snapshotPath, "utf8");
  const snapshot = JSON.parse(raw);
  const record = snapshot.records[0];
  const root = buildMerkleRoot(snapshot.records);
  const proof = buildProof(snapshot.records, record.name);
  const resultHash = computeResolveResultHash({
    name: record.name,
    network: "dns",
    records: record.records
  });

  const privKey = new Uint8Array(32);
  privKey[0] = 1;
  const pubKey = await ed.getPublicKeyAsync(privKey);
  const pubHex = bytesToHex(pubKey);
  const authoritySig = await signAuthority(bytesToHex(privKey), resultHash);

  process.env.COMMENTS_SITE_TOKEN = "test-token";
  process.env.RESOLVER_PUBKEY_HEX = pubHex;
  process.env.REGISTRY_PATH = snapshotPath;

  const { server, port } = await startServer();
  try {
    const res = await postJson(port, "/node/verify", {
      entry: record,
      proof: proof.proof,
      root,
      site_id: "site-1",
      authority_sig: authoritySig,
      result_hash: resultHash
    }, { "x-ddns-site-token": "test-token" });

    assert.strictEqual(res.status, 200);
    assert.ok(res.payload.verification_id);
    console.log("node verify endpoint test passed");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

run();

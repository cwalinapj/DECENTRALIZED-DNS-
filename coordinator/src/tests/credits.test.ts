import assert from "node:assert";
import { applyReceipt, type CreditsState } from "../routes/receipts.js";
import type { ReceiptEnvelope } from "../../../core/dist/credits/types.d.ts";
import { signReceipt } from "../../../core/dist/credits/receipts.js";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

const seedHex = "a".repeat(64);
let pubB64 = "";
let privHex = seedHex;

function createState(): CreditsState {
  return {
    receipts: new Map(),
    credits: new Map(),
    passports: new Set([pubB64]),
    nodePubkeys: new Set(),
    challenges: new Map(),
    rate: new Map()
  };
}

async function makeEnvelope(type: "SERVE" | "VERIFY" | "STORE") {
  const receipt = {
    type,
    node_id: pubB64,
    ts: 123,
    request: { name: "example.dns" },
    result_hash: "abc",
    bytes: 10
  };
  const signature = await signReceipt(privHex, receipt as any);
  const env: ReceiptEnvelope = { receipt: receipt as any, signature, public_key: pubB64 };
  return env;
}

(async () => {
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
  const seed = new Uint8Array(seedHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  const pub = await ed.getPublicKeyAsync(seed);
  pubB64 = Buffer.from(pub).toString("base64");
  const state = createState();

  const receipt = await makeEnvelope("STORE");
  const result = await applyReceipt(state, receipt as any, {
    serveCredits: 1,
    verifyCredits: 1,
    storeCredits: 2,
    resolverPubkeyHex: undefined,
    allowUnverifiedServe: true,
    maxPerMinute: 10
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(state.credits.get(pubB64), 2);

  const receipt2 = await makeEnvelope("SERVE");
  const result2 = await applyReceipt(state, receipt2 as any, {
    serveCredits: 1,
    verifyCredits: 1,
    storeCredits: 2,
    resolverPubkeyHex: undefined,
    allowUnverifiedServe: true,
    maxPerMinute: 10
  });
  assert.strictEqual(result2.ok, true);
  assert.strictEqual(state.credits.get(pubB64), 3);

  console.log("credits coordinator tests passed");
})();

import assert from "node:assert";
import { applyReceipt, type CreditsState } from "../routes/receipts.js";
import type { ReceiptCore } from "../../../../../ddns-core/credits/types.d.ts";
import { computeReceiptId, signReceipt } from "../../../../../ddns-core/credits/receipts.js";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

const seedHex = "a".repeat(64);
let wallet = "";
let priv = seedHex;

function createState(): CreditsState {
  return {
    receipts: new Map(),
    credits: new Map(),
    passports: new Set([wallet]),
    challenges: new Map(),
    rate: new Map()
  };
}

async function makeReceipt(type: "SERVE" | "VERIFY" | "STORE") {
  const core: Omit<ReceiptCore, "id"> = {
    type,
    wallet,
    timestamp: new Date().toISOString(),
    payload: { name: "example.dns" }
  };
  const id = computeReceiptId(core);
  const receiptCore: ReceiptCore = { ...core, id } as ReceiptCore;
  const signature = await signReceipt(priv, receiptCore);
  return { ...receiptCore, signature };
}

(async () => {
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
  const seed = new Uint8Array(seedHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  const pub = await ed.getPublicKeyAsync(seed);
  wallet = Buffer.from(pub).toString("hex");
  const state = createState();
  const receipt = await makeReceipt("STORE");
  const result = await applyReceipt(state, receipt as any, {
    serveCredits: 1,
    verifyCredits: 1,
    storeCredits: 2,
    resolverPubkeyHex: undefined,
    allowUnverifiedServe: true,
    maxPerMinute: 10
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(state.credits.get(wallet), 2);

  const receipt2 = await makeReceipt("SERVE");
  const result2 = await applyReceipt(state, receipt2 as any, {
    serveCredits: 1,
    verifyCredits: 1,
    storeCredits: 2,
    resolverPubkeyHex: undefined,
    allowUnverifiedServe: true,
    maxPerMinute: 10
  });
  assert.strictEqual(result2.ok, true);
  assert.strictEqual(state.credits.get(wallet), 3);

  console.log("credits coordinator tests passed");
})();

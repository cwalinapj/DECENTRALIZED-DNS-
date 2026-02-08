#!/usr/bin/env node
import crypto from "node:crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function computeReceiptId(core) {
  const payload = stableStringify(core);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function signMessage(privHex, message) {
  const sig = await ed.signAsync(new TextEncoder().encode(message), hexToBytes(privHex));
  return Buffer.from(sig).toString("hex");
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (!mode || !["login", "receipt"].includes(mode)) {
    console.error("Usage: credits-sign.mjs login|receipt ...");
    process.exit(1);
  }
  const priv = args.find((a) => a.startsWith("--priv="))?.split("=")[1];
  if (!priv) {
    console.error("--priv=<hex> required");
    process.exit(1);
  }

  if (mode === "login") {
    const challenge = args.find((a) => a.startsWith("--challenge="))?.split("=")[1];
    if (!challenge) {
      console.error("--challenge=<string> required");
      process.exit(1);
    }
    const message = `login\n${challenge}`;
    const sig = await signMessage(priv, message);
    console.log(JSON.stringify({ message, signature: sig }, null, 2));
    return;
  }

  if (mode === "receipt") {
    const type = args.find((a) => a.startsWith("--type="))?.split("=")[1] || "SERVE";
    const wallet = args.find((a) => a.startsWith("--wallet="))?.split("=")[1];
    const name = args.find((a) => a.startsWith("--name="))?.split("=")[1] || "";
    if (!wallet) {
      console.error("--wallet=<pubkey hex> required");
      process.exit(1);
    }
    const core = {
      type,
      wallet,
      timestamp: new Date().toISOString(),
      payload: { name }
    };
    const id = computeReceiptId(core);
    const receipt = { ...core, id };
    const message = `receipt\n${stableStringify(receipt)}`;
    const signature = await signMessage(priv, message);
    console.log(JSON.stringify({ ...receipt, signature }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
import { hash as blake3 } from "blake3";

export function computeNodeName(pubkey) {
  const bytes = decodeKey(pubkey);
  const digest = Buffer.from(blake3(bytes)).toString("hex");
  const shortId = digest.slice(0, 10);
  return `node-${shortId}.dns`;
}

function decodeKey(input) {
  if (/^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0) {
    return hexToBytes(input);
  }
  return Uint8Array.from(Buffer.from(input, "base64"));
}

function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const keyIndex = args.findIndex((arg) => arg === "--pubkey");
  const pubkey = keyIndex >= 0 ? args[keyIndex + 1] : args[0];
  if (!pubkey) {
    console.error("Usage: node-name --pubkey <base64|hex>");
    process.exit(1);
  }
  console.log(computeNodeName(pubkey));
}

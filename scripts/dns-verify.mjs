#!/usr/bin/env node
import fs from "node:fs";
import punycode from "punycode";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const ALLOWED_TYPES = new Set(["OWNER", "NODE_PUBKEY", "ENDPOINT", "CAPS", "TEXT"]);

function normalizeName(name) {
  const trimmed = name.trim().replace(/\.$/, "");
  return punycode.toASCII(trimmed.toLowerCase());
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (!key) continue;
    if (key === "--file") out.file = value;
    if (key === "--registry") out.registry = value;
  }
  return out;
}

function canonicalizePayload(payload) {
  const normalized = {
    name: normalizeName(payload.name),
    owner: payload.owner,
    version: payload.version,
    updatedAt: payload.updatedAt,
    nonce: payload.nonce,
    records: normalizeRecordEntries(payload.records || [])
  };
  return JSON.stringify(normalized);
}

function messageForPayload(payload) {
  return `dns_update\n${canonicalizePayload(payload)}`;
}

function normalizeRecordEntries(records) {
  if (!records.length || !records.some((entry) => String(entry.type).toUpperCase() === "OWNER")) {
    throw new Error("OWNER record required");
  }
  return records.map((entry) => {
    const type = String(entry.type).toUpperCase();
    if (!ALLOWED_TYPES.has(type)) throw new Error(`unsupported record type ${type}`);
    return entry;
  });
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

async function main() {
  const opts = parseArgs();
  if (!opts.file) {
    console.error("Usage: dns-verify --file signed.json [--registry registry.json]");
    process.exit(1);
  }
  const raw = fs.readFileSync(opts.file, "utf8");
  const payload = JSON.parse(raw);
  if (!payload?.payload || !payload?.signature || !payload?.publicKey) {
    console.error("invalid payload");
    process.exit(1);
  }
  const msg = messageForPayload(payload.payload);
  const pub = decodeKey(payload.publicKey);
  const sig = decodeKey(payload.signature);
  const ok = await ed.verifyAsync(sig, Buffer.from(msg), pub);
  if (!ok) {
    console.error("signature verification failed");
    process.exit(1);
  }

  if (opts.registry) {
    const registry = JSON.parse(fs.readFileSync(opts.registry, "utf8"));
    const normalized = normalizeName(payload.payload.name);
    const record = registry.records.find((entry) => normalizeName(entry.name) === normalized);
    if (record) {
      const owner = record.records.find((entry) => String(entry.type).toUpperCase() === "OWNER");
      const ownerValue = owner ? String(owner.value) : "";
      if (!ownerValue || ownerValue.replace(/^ed25519:/, "") !== Buffer.from(pub).toString("base64")) {
        console.error("owner mismatch with current registry record");
        process.exit(1);
      }
    }
  }

  console.log("ok");
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

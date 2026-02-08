#!/usr/bin/env node
import fs from "node:fs";
import punycode from "punycode";
import { hash as blake3 } from "blake3";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const ALLOWED_TYPES = new Set(["OWNER", "NODE_PUBKEY", "ENDPOINT", "CAPS", "TEXT"]);
const ALLOWED_CAPS = new Set(["cache", "verify", "store", "proxy", "tor"]);

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { records: [] };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (!key) continue;
    if (key === "--name") out.name = value;
    if (key === "--owner") out.owner = value;
    if (key === "--record") out.records.push(value);
    if (key === "--ttl") out.ttl = Number(value);
    if (key === "--nonce") out.nonce = Number(value);
    if (key === "--version") out.version = Number(value);
    if (key === "--updated-at") out.updatedAt = value;
    if (key === "--private-key") out.privateKey = value;
  }
  return out;
}

function normalizeName(name) {
  const trimmed = name.trim().replace(/\.$/, "");
  return punycode.toASCII(trimmed.toLowerCase());
}

function decodeKey(input) {
  if (!input) throw new Error("missing_private_key");
  if (fs.existsSync(input)) {
    return decodeKey(fs.readFileSync(input, "utf8").trim());
  }
  const envValue = process.env[input];
  if (envValue) return decodeKey(envValue);
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

function parseRecord(line, ttl) {
  const [typePart, valuePart] = line.split(":");
  const type = String(typePart || "").toUpperCase();
  if (!ALLOWED_TYPES.has(type)) throw new Error(`unsupported record type ${type}`);
  if (type === "TEXT") {
    const [key, value] = String(valuePart || "").split("=");
    if (!key || !value) throw new Error("TEXT record requires key=value");
    return { type, value: { key, value }, ttl };
  }
  if (!valuePart) throw new Error("record value required");
  return { type, value: valuePart, ttl };
}

function normalizeRecordEntries(records) {
  if (!records.length || !records.some((entry) => entry.type === "OWNER")) {
    throw new Error("OWNER record required");
  }
  const normalized = records.map((entry) => {
    const type = entry.type;
    if (type === "TEXT") {
      if (!entry.value || typeof entry.value !== "object") throw new Error("TEXT record must be {key,value}");
      return { type, key: entry.value.key, value: entry.value.value, ttl: entry.ttl };
    }
    if (type === "ENDPOINT") {
      const url = new URL(entry.value);
      if (url.protocol !== "https:") throw new Error("ENDPOINT must be https");
      return { type, key: "", value: entry.value, ttl: entry.ttl };
    }
    if (type === "NODE_PUBKEY") {
      if (!String(entry.value).startsWith("ed25519:")) throw new Error("NODE_PUBKEY must be ed25519:<base64>");
      return { type, key: "", value: entry.value, ttl: entry.ttl };
    }
    if (type === "CAPS") {
      const caps = String(entry.value).split(",").map((cap) => cap.trim().toLowerCase()).filter(Boolean);
      for (const cap of caps) {
        if (!ALLOWED_CAPS.has(cap)) throw new Error(`unsupported cap ${cap}`);
      }
      const value = Array.from(new Set(caps)).sort().join(",");
      return { type, key: "", value, ttl: entry.ttl };
    }
    if (!entry.value) throw new Error(`${type} must be non-empty string`);
    return { type, key: "", value: entry.value, ttl: entry.ttl };
  });
  return normalized.sort((a, b) => {
    const keyA = `${a.type}|${a.key}|${a.value}`;
    const keyB = `${b.type}|${b.key}|${b.value}`;
    return keyA.localeCompare(keyB);
  });
}

function canonicalizePayload(payload) {
  const normalized = {
    name: normalizeName(payload.name),
    owner: payload.owner,
    version: payload.version,
    updatedAt: payload.updatedAt,
    nonce: payload.nonce,
    records: normalizeRecordEntries(payload.records)
  };
  return JSON.stringify(normalized);
}

function messageForPayload(payload) {
  return `dns_update\n${canonicalizePayload(payload)}`;
}

async function main() {
  const opts = parseArgs();
  if (!opts.name || !opts.owner || !opts.privateKey || typeof opts.nonce !== "number") {
    console.error("Usage: --name alice.dns --owner <pubkey> --record TYPE:VALUE --nonce N --private-key <path|env|key>");
    process.exit(1);
  }
  const ttl = Number.isFinite(opts.ttl) ? opts.ttl : undefined;
  const records = [
    { type: "OWNER", value: opts.owner },
    ...opts.records.map((line) => parseRecord(line, ttl))
  ];
  const payload = {
    name: opts.name,
    owner: opts.owner,
    version: opts.version || 1,
    updatedAt: opts.updatedAt || new Date().toISOString(),
    nonce: opts.nonce,
    records
  };
  const msg = messageForPayload(payload);
  const priv = decodeKey(opts.privateKey);
  if (priv.length !== 32) {
    console.error("private key must be 32 bytes (ed25519 seed)");
    process.exit(1);
  }
  const signature = await ed.signAsync(Buffer.from(msg), priv);
  const publicKey = await ed.getPublicKeyAsync(priv);
  const out = {
    payload,
    signature: Buffer.from(signature).toString("base64"),
    publicKey: Buffer.from(publicKey).toString("base64")
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

import fs from "node:fs";
import punycode from "punycode";
import { hash as blake3 } from "blake3";
import { utf8ToBytes } from "@noble/hashes/utils";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export function normalizeName(name) {
  const trimmed = name.trim().replace(/\.$/, "");
  return punycode.toASCII(trimmed.toLowerCase());
}

export function loadSnapshot(path) {
  const raw = fs.readFileSync(path, "utf8");
  return JSON.parse(raw);
}

export function saveSnapshot(path, snapshot) {
  fs.writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
}

const ALLOWED_TYPES = new Set(["OWNER", "NODE_PUBKEY", "ENDPOINT", "CAPS", "TEXT"]);
const ALLOWED_CAPS = new Set(["cache", "verify", "store", "proxy", "tor"]);

export function canonicalizeRecord(record) {
  const normalizedName = normalizeName(record.name);
  const normalizedRecords = normalizeRecordEntries(record.records);
  const payload = {
    name: normalizedName,
    version: record.version,
    updatedAt: record.updatedAt,
    records: normalizedRecords
  };
  if (record.owner) payload.owner = record.owner;
  return JSON.stringify(payload);
}

export function canonicalizePayload(payload) {
  const normalizedName = normalizeName(payload.name);
  const normalizedRecords = normalizeRecordEntries(payload.records || []);
  const normalized = {
    name: normalizedName,
    owner: payload.owner,
    version: payload.version,
    updatedAt: payload.updatedAt,
    nonce: payload.nonce,
    records: normalizedRecords
  };
  return JSON.stringify(normalized);
}

export function recordMessage(payload) {
  const canonical = canonicalizePayload(payload);
  return `dns_update\n${canonical}`;
}

export function deleteMessage(name, updatedAt, nonce) {
  return `dns_delete\n${normalizeName(name)}\n${updatedAt}\n${nonce}`;
}

export function hashRecord(record) {
  const canonical = canonicalizeRecord(record);
  const name = normalizeName(record.name);
  return bytesToHex(blake3(utf8ToBytes(`${name}\n${canonical}`)));
}

export async function verifySignature(pubkey, message, signature) {
  const pub = decodeKey(pubkey);
  const sig = decodeKey(signature);
  return await ed.verifyAsync(sig, utf8ToBytes(message), pub);
}

function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function decodeKey(input) {
  if (!input) throw new Error("missing_key");
  if (/^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0) {
    return hexToBytes(input);
  }
  return Uint8Array.from(Buffer.from(input, "base64"));
}

function normalizeRecordEntries(records) {
  if (!records.length || !records.some((entry) => String(entry.type).toUpperCase() === "OWNER")) {
    throw new Error("OWNER record required");
  }
  const normalized = records.map((entry) => {
    const type = String(entry.type).toUpperCase();
    if (!ALLOWED_TYPES.has(type)) throw new Error(`unsupported record type ${type}`);
    if (type === "TEXT") {
      if (!entry.value || typeof entry.value !== "object") throw new Error("TEXT record must be {key,value}");
      if (!entry.value.key || !entry.value.value) throw new Error("TEXT record requires key/value");
      return { type, key: entry.value.key, value: entry.value.value, ttl: entry.ttl };
    }
    if (type === "ENDPOINT") {
      if (typeof entry.value !== "string") throw new Error("ENDPOINT must be string");
      const url = new URL(entry.value);
      if (url.protocol !== "https:") throw new Error("ENDPOINT must be https");
      return { type, key: "", value: entry.value, ttl: entry.ttl };
    }
    if (type === "NODE_PUBKEY") {
      if (typeof entry.value !== "string") throw new Error("NODE_PUBKEY must be string");
      if (!entry.value.startsWith("ed25519:")) throw new Error("NODE_PUBKEY must be ed25519:<base64>");
      return { type, key: "", value: entry.value, ttl: entry.ttl };
    }
    if (type === "CAPS") {
      if (typeof entry.value !== "string") throw new Error("CAPS must be string");
      const caps = entry.value.split(",").map((cap) => cap.trim().toLowerCase()).filter(Boolean);
      for (const cap of caps) {
        if (!ALLOWED_CAPS.has(cap)) throw new Error(`unsupported cap ${cap}`);
      }
      const value = Array.from(new Set(caps)).sort().join(",");
      return { type, key: "", value, ttl: entry.ttl };
    }
    if (typeof entry.value !== "string" || !entry.value) throw new Error(`${type} must be non-empty string`);
    return { type, key: "", value: entry.value, ttl: entry.ttl };
  });
  return normalized.sort((a, b) => {
    const keyA = `${a.type}|${a.key}|${a.value}`;
    const keyB = `${b.type}|${b.key}|${b.value}`;
    return keyA.localeCompare(keyB);
  });
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

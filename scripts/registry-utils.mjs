import fs from "node:fs";
import punycode from "punycode";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
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

export function canonicalizeRecord(record) {
  const normalized = {
    name: normalizeName(record.name),
    owner: record.owner || undefined,
    version: record.version,
    updatedAt: record.updatedAt,
    records: [...record.records]
      .map((entry) => ({
        type: String(entry.type).toUpperCase(),
        value: String(entry.value),
        ttl: entry.ttl
      }))
      .sort((a, b) => {
        const keyA = `${a.type}|${a.value}|${a.ttl ?? ""}`;
        const keyB = `${b.type}|${b.value}|${b.ttl ?? ""}`;
        return keyA.localeCompare(keyB);
      })
  };

  const payload = {
    name: normalized.name,
    records: normalized.records,
    version: normalized.version,
    updatedAt: normalized.updatedAt
  };
  if (normalized.owner) payload.owner = normalized.owner;
  return JSON.stringify(payload);
}

export function recordMessage(record) {
  const canonical = canonicalizeRecord(record);
  return `registry_update\n${canonical}`;
}

export function deleteMessage(name, updatedAt) {
  return `registry_delete\n${normalizeName(name)}\n${updatedAt}`;
}

export function hashRecord(record) {
  const canonical = canonicalizeRecord(record);
  const name = normalizeName(record.name);
  return bytesToHex(sha256(utf8ToBytes(`${name}\n${canonical}`)));
}

export async function verifySignature(pubkeyHex, message, signatureHex) {
  const pub = hexToBytes(pubkeyHex);
  const sig = hexToBytes(signatureHex);
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

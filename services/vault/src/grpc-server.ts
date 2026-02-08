import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { VaultEntry } from "./types.js";

const vaultDir = process.env.VAULT_DIR || "./vault-data";
const allowUnauthenticated = process.env.ALLOW_UNAUTHENTICATED === "1";
const authToken = process.env.VAULT_AUTH_TOKEN || "";
const port = Number(process.env.GRPC_PORT || 8892);

function walletDir(walletId: string) {
  return path.join(vaultDir, walletId);
}

function entryPath(walletId: string, entryId: string) {
  return path.join(walletDir(walletId), `${entryId}.json`);
}

function persistEntry(entry: VaultEntry) {
  const dir = walletDir(entry.wallet_id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(entryPath(entry.wallet_id, entry.entry_id), JSON.stringify(entry, null, 2));
}

function loadEntry(walletId: string, entryId: string): VaultEntry | null {
  const file = entryPath(walletId, entryId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as VaultEntry;
}

function sanitizeEntry(input: any): VaultEntry {
  if (!input?.wallet_id || !input?.entry_id || !input?.type || !input?.ciphertext || !input?.key_id) {
    throw new Error("invalid_entry");
  }
  const now = new Date().toISOString();
  return {
    wallet_id: String(input.wallet_id),
    entry_id: String(input.entry_id),
    type: String(input.type),
    ciphertext: String(input.ciphertext),
    key_id: String(input.key_id),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : undefined,
    created_at: input.created_at || now,
    rotated_at: input.rotated_at
  };
}

function ensureAuth(call: grpc.ServerUnaryCall<any, any>): boolean {
  if (allowUnauthenticated) return true;
  if (!authToken) return false;
  const meta = call.metadata.get("x-ddns-vault-token");
  return meta.length > 0 && String(meta[0]) === authToken;
}

const protoPath = path.join(process.cwd(), "proto", "vault.proto");
const packageDef = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true
});
const loaded = grpc.loadPackageDefinition(packageDef) as any;
const service = loaded.ddns.vault.VaultService;

const handlers = {
  StoreEntry: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
    if (!ensureAuth(call)) return cb({ code: grpc.status.UNAUTHENTICATED, message: "unauthorized" });
    try {
      const entry = sanitizeEntry(call.request);
      persistEntry(entry);
      cb(null, { ok: true, wallet_id: entry.wallet_id, entry_id: entry.entry_id });
    } catch (err: any) {
      cb(null, { ok: false, error: err.message || "invalid_request" });
    }
  },
  RotateEntry: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
    if (!ensureAuth(call)) return cb({ code: grpc.status.UNAUTHENTICATED, message: "unauthorized" });
    try {
      const entry = sanitizeEntry(call.request);
      entry.rotated_at = entry.rotated_at || new Date().toISOString();
      entry.key_id = entry.key_id || crypto.randomUUID();
      persistEntry(entry);
      cb(null, {
        ok: true,
        wallet_id: entry.wallet_id,
        entry_id: entry.entry_id,
        key_id: entry.key_id,
        metadata_json: entry.metadata ? JSON.stringify(entry.metadata) : ""
      });
    } catch (err: any) {
      cb(null, { ok: false, error: err.message || "invalid_request" });
    }
  },
  GetEntry: (call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
    if (!ensureAuth(call)) return cb({ code: grpc.status.UNAUTHENTICATED, message: "unauthorized" });
    const walletId = String(call.request?.wallet_id || "");
    const entryId = String(call.request?.entry_id || "");
    if (!walletId || !entryId) return cb(null, { ok: false, error: "missing_wallet_or_entry" });
    const entry = loadEntry(walletId, entryId);
    if (!entry) return cb(null, { ok: false, error: "not_found" });
    cb(null, {
      ok: true,
      wallet_id: entry.wallet_id,
      entry_id: entry.entry_id,
      ciphertext: entry.ciphertext,
      key_id: entry.key_id,
      metadata_json: entry.metadata ? JSON.stringify(entry.metadata) : ""
    });
  },
  Health: (_call: grpc.ServerUnaryCall<any, any>, cb: grpc.sendUnaryData<any>) => {
    cb(null, { ok: true });
  }
};

const server = new grpc.Server();
server.addService(service.service, handlers);

server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
  if (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`vault gRPC listening on :${port}`);
  server.start();
});

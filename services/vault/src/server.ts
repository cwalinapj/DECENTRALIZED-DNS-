import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { VaultConfig, VaultEntry } from "./types.js";

const vaultDir = process.env.VAULT_DIR || "./vault-data";
const allowUnauthenticated = process.env.ALLOW_UNAUTHENTICATED === "1";
const authToken = process.env.VAULT_AUTH_TOKEN || "";
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 1_000_000);

const config: VaultConfig = {
  vaultDir,
  allowUnauthenticated,
  authToken,
  maxBodyBytes
};

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new Error("Payload too large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function ensureAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (config.allowUnauthenticated) return true;
  if (!config.authToken) {
    sendJson(res, 500, { error: "auth_not_configured" });
    return false;
  }
  const token = req.headers["x-ddns-vault-token"];
  if (token !== config.authToken) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
}

function walletDir(walletId: string) {
  return path.join(config.vaultDir, walletId);
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

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "missing_url" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,x-ddns-vault-token"
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!ensureAuth(req, res)) return;

  if (req.method === "POST" && url.pathname === "/vault/entry") {
    try {
      const body = await readBody(req, config.maxBodyBytes);
      const entry = sanitizeEntry(body);
      persistEntry(entry);
      sendJson(res, 200, { ok: true, entry_id: entry.entry_id });
      return;
    } catch (err: any) {
      sendJson(res, 400, { error: err.message || "invalid_request" });
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/vault/rotate") {
    try {
      const body = await readBody(req, config.maxBodyBytes);
      const entry = sanitizeEntry(body);
      entry.rotated_at = entry.rotated_at || new Date().toISOString();
      entry.key_id = entry.key_id || crypto.randomUUID();
      persistEntry(entry);
      sendJson(res, 200, { ok: true, entry_id: entry.entry_id, rotated_at: entry.rotated_at });
      return;
    } catch (err: any) {
      sendJson(res, 400, { error: err.message || "invalid_request" });
      return;
    }
  }

  if (req.method === "GET" && url.pathname.startsWith("/vault/entry/")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const walletId = parts[2];
    const entryId = parts[3];
    if (!walletId || !entryId) {
      sendJson(res, 400, { error: "missing_wallet_or_entry" });
      return;
    }
    const entry = loadEntry(walletId, entryId);
    if (!entry) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    sendJson(res, 200, { ok: true, entry });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

const port = Number(process.env.PORT || 8891);
server.listen(port, () => {
  if (!allowUnauthenticated && !authToken) {
    // eslint-disable-next-line no-console
    console.warn("VAULT_AUTH_TOKEN not set. Requests will be rejected.");
  }
  // eslint-disable-next-line no-console
  console.log(`vault service listening on :${port}`);
});

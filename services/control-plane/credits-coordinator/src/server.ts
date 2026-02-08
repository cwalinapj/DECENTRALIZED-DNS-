import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { applyReceipt, createChallenge, type CreditsState, receiptIdFromEnvelope } from "./routes/receipts.js";
import { getBalance, spendCredits } from "./routes/credits.js";
import {
  type CommentState,
  createHold,
  finalizeHold,
  submitHold
} from "./routes/comments.js";
import {
  type CommentAuthState,
  createCommentChallenge,
  verifyCommentSignature
} from "./routes/comment-auth.js";
import type { ReceiptEnvelope } from "../../../../ddns-core/dist/credits/types.d.ts";
import { verifyEd25519Message } from "../../../../ddns-core/dist/credits/verify.js";

const port = Number(process.env.PORT || 8822);
const dataDir = process.env.DATA_DIR || "./data";
const adminToken = process.env.ADMIN_TOKEN || "";
const sessionTtlMs = Number(process.env.SESSION_TTL_MS || 10 * 60 * 1000);
const serveCredits = Number(process.env.CREDITS_SERVE || 1);
const verifyCredits = Number(process.env.CREDITS_VERIFY || 1);
const storeCredits = Number(process.env.CREDITS_STORE || 1);
const resolverPubkeyHex = process.env.RESOLVER_PUBKEY_HEX || "";
const allowUnverifiedServe = process.env.ALLOW_UNVERIFIED_SERVE === "1";
const maxPerMinute = Number(process.env.MAX_RECEIPTS_PER_MIN || 60);
const passportAllowlist = (process.env.PASSPORT_ALLOWLIST || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const passportEnabled = process.env.PASSPORT_ENABLED === "1";
const passportChain = process.env.PASSPORT_CHAIN || "base";
const passportRpc = process.env.ETH_RPC_URL || "";
const passportContract = process.env.PASSPORT_CONTRACT || "";
const passportTokenType = process.env.PASSPORT_TOKEN_TYPE || "erc721";
const dailyCreditCap = Number(process.env.DAILY_CREDIT_CAP || 100);
const commentsHoldTtlMs = Number(process.env.COMMENTS_HOLD_TTL_MS || 15 * 60 * 1000);
const commentsMaxPerMinuteWallet = Number(process.env.COMMENTS_MAX_PER_MIN_WALLET || 12);
const commentsMaxPerMinuteSite = Number(process.env.COMMENTS_MAX_PER_MIN_SITE || 120);
const commentsBonusMax = Number(process.env.COMMENTS_BONUS_MAX || 3);
const commentsWalletCooldownMs = Number(process.env.COMMENTS_WALLET_COOLDOWN_MS || 5_000);
const commentsSiteToken = process.env.COMMENTS_SITE_TOKEN || "";
const commentsAuthTtlMs = Number(process.env.COMMENTS_AUTH_TTL_MS || 10 * 60 * 1000);

const state: CreditsState = {
  receipts: new Map(),
  credits: new Map(),
  passports: new Set(passportAllowlist),
  challenges: new Map(),
  rate: new Map()
};

const sessions = new Map<string, { nodeId: string; expiresAt: number }>();
const challenges = new Map<string, { wallet: string; challenge: string; expiresAt: number }>();
const passportCache = new Map<string, { ok: boolean; expiresAt: number }>();
const creditWindows = new Map<string, { date: string; credited: number }>();
const comments: CommentState = {
  holds: new Map(),
  walletRate: new Map(),
  siteRate: new Map(),
  walletCooldown: new Map()
};
const commentAuth: CommentAuthState = {
  challenges: new Map()
};

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistJson(relPath: string, payload: unknown) {
  const file = path.join(dataDir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

function loadJson(relPath: string, fallback: unknown) {
  const file = path.join(dataDir, relPath);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadState() {
  const ledger = loadJson("credits/ledger.json", {});
  Object.entries(ledger as Record<string, number>).forEach(([wallet, amount]) => state.credits.set(wallet, amount));
  const passportList = loadJson("credits/passports.json", passportAllowlist);
  (passportList as string[]).forEach((wallet) => state.passports.add(wallet));
  const holds = loadJson("comments/holds.json", []);
  (holds as any[]).forEach((hold) => {
    if (hold && hold.ticket_id) {
      comments.holds.set(hold.ticket_id, hold as any);
    }
  });
}

function saveState() {
  const ledger: Record<string, number> = {};
  state.credits.forEach((value, key) => (ledger[key] = value));
  persistJson("credits/ledger.json", ledger);
  persistJson("credits/passports.json", Array.from(state.passports));
  persistJson("credits/receipts.json", Array.from(state.receipts.values()));
  persistJson("credits/windows.json", Array.from(creditWindows.entries()));
  persistJson("comments/holds.json", Array.from(comments.holds.values()));
}

loadState();

export function createCreditsServer() {
  return createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/auth/challenge") {
    const body = await readBody(req);
    if (!body?.wallet) return sendJson(res, 400, { error: "missing_wallet" });
    const challenge = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + sessionTtlMs;
    challenges.set(body.wallet, { wallet: body.wallet, challenge, expiresAt });
    return sendJson(res, 200, { wallet: body.wallet, challenge, expiresAt });
  }

  if (req.method === "POST" && url.pathname === "/auth/verify") {
    const body = await readBody(req);
    if (!body?.wallet || !body?.signature) return sendJson(res, 400, { error: "missing_fields" });
    const challenge = challenges.get(body.wallet);
    if (!challenge || challenge.expiresAt < Date.now()) return sendJson(res, 400, { error: "challenge_expired" });
    const msg = `login\n${challenge.challenge}`;
    const ok = await verifyEd25519Message(body.wallet, msg, body.signature);
    if (!ok) return sendJson(res, 403, { error: "invalid_signature" });
    if (passportEnabled) {
      const owns = await passportOwns(body.wallet);
      if (!owns) return sendJson(res, 403, { error: "passport_required" });
    } else if (!state.passports.has(body.wallet)) {
      return sendJson(res, 403, { error: "passport_required" });
    }
    const token = crypto.randomBytes(16).toString("hex");
    sessions.set(token, { nodeId: body.wallet, expiresAt: Date.now() + sessionTtlMs });
    return sendJson(res, 200, { token, expiresAt: Date.now() + sessionTtlMs });
  }

  if (req.method === "GET" && url.pathname === "/credits") {
    const wallet = url.searchParams.get("wallet") || "";
    if (!wallet) return sendJson(res, 400, { error: "missing_wallet" });
    return sendJson(res, 200, { wallet, balance: getBalance(state, wallet) });
  }

  if (req.method === "POST" && url.pathname === "/credits/spend") {
    const body = await readBody(req);
    const token = req.headers["x-session-token"];
    if (!token || typeof token !== "string") return sendJson(res, 401, { error: "not_authenticated" });
    const session = sessions.get(token);
    if (!session || session.expiresAt < Date.now()) return sendJson(res, 401, { error: "not_authenticated" });
    const wallet = session.nodeId;
    const amount = Number(body?.amount || 0);
    if (!amount || amount <= 0) return sendJson(res, 400, { error: "invalid_amount" });
    const result = spendCredits(state, wallet, amount);
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    saveState();
    return sendJson(res, 200, { wallet, balance: getBalance(state, wallet) });
  }

  if (req.method === "POST" && url.pathname === "/receipts") {
    const body = await readBody(req);
    const envelope = body as ReceiptEnvelope;
    const result = await applyReceipt(state, envelope, {
      serveCredits,
      verifyCredits,
      storeCredits,
      resolverPubkeyHex: resolverPubkeyHex || undefined,
      allowUnverifiedServe,
      maxPerMinute
    });
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    if (!applyDailyCap(envelope.receipt.node_id, result.ok ? creditDelta(envelope.receipt.type) : 0)) {
      return sendJson(res, 400, { error: "credit_cap_exceeded" });
    }
    saveState();
    return sendJson(res, 200, { ok: true, balance: getBalance(state, envelope.receipt.node_id) });
  }

  if (req.method === "POST" && url.pathname === "/comments/auth/challenge") {
    const body = await readBody(req);
    if (!body?.wallet) return sendJson(res, 400, { error: "missing_wallet" });
    const result = createCommentChallenge(commentAuth, body.wallet, commentsAuthTtlMs);
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/comments/auth/verify") {
    const body = await readBody(req);
    if (!body?.wallet || !body?.signature) return sendJson(res, 400, { error: "missing_fields" });
    const ok = verifyCommentSignature(commentAuth, body.wallet, body.signature);
    if (!ok) return sendJson(res, 403, { error: "invalid_signature" });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/comments/hold") {
    const body = await readBody(req);
    const token = req.headers["x-ddns-site-token"];
    if (!commentsSiteToken || token !== commentsSiteToken) {
      return sendJson(res, 403, { error: "unauthorized" });
    }
    const result = createHold(state, comments, body || {}, {
      holdTtlMs: commentsHoldTtlMs,
      maxPerMinuteWallet: commentsMaxPerMinuteWallet,
      maxPerMinuteSite: commentsMaxPerMinuteSite,
      bonusMax: commentsBonusMax,
      walletCooldownMs: commentsWalletCooldownMs
    });
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    saveState();
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/comments/submit") {
    const body = await readBody(req);
    const token = req.headers["x-ddns-site-token"];
    if (!commentsSiteToken || token !== commentsSiteToken) {
      return sendJson(res, 403, { error: "unauthorized" });
    }
    const result = submitHold(comments, body || {});
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    saveState();
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/comments/finalize") {
    const body = await readBody(req);
    const token = req.headers["x-ddns-site-token"];
    if (!commentsSiteToken || token !== commentsSiteToken) {
      return sendJson(res, 403, { error: "unauthorized" });
    }
    const result = finalizeHold(state, comments, body || {}, {
      holdTtlMs: commentsHoldTtlMs,
      maxPerMinuteWallet: commentsMaxPerMinuteWallet,
      maxPerMinuteSite: commentsMaxPerMinuteSite,
      bonusMax: commentsBonusMax,
      walletCooldownMs: commentsWalletCooldownMs
    });
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    saveState();
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/audits/challenge") {
    const body = await readBody(req);
    const token = req.headers["x-admin-token"];
    if (!adminToken || token !== adminToken) return sendJson(res, 403, { error: "unauthorized" });
    if (!body?.wallet || !body?.chunkHash) return sendJson(res, 400, { error: "missing_fields" });
    const challenge = createChallenge(state, body.wallet, body.chunkHash, 5 * 60 * 1000);
    return sendJson(res, 200, { challenge });
  }

  sendJson(res, 404, { error: "not_found" });
  });
}

const server = createCreditsServer();

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(port, () => {
    console.log(`credits coordinator listening on ${port}`);
  });
}

function creditDelta(type: string) {
  if (type === "SERVE") return serveCredits;
  if (type === "VERIFY") return verifyCredits;
  if (type === "STORE") return storeCredits;
  return 0;
}

function applyDailyCap(wallet: string, delta: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const entry = creditWindows.get(wallet) || { date: today, credited: 0 };
  if (entry.date !== today) {
    entry.date = today;
    entry.credited = 0;
  }
  if (entry.credited + delta > dailyCreditCap) {
    return false;
  }
  entry.credited += delta;
  creditWindows.set(wallet, entry);
  return true;
}

export async function passportOwns(wallet: string): Promise<boolean> {
  if (!passportEnabled) return true;
  if (!passportRpc || !passportContract) {
    throw new Error("passport_env_missing");
  }
  if (passportTokenType !== "erc721") {
    throw new Error("unsupported_token_type");
  }
  const cached = passportCache.get(wallet);
  if (cached && cached.expiresAt > Date.now()) return cached.ok;
  const result = await balanceOf(wallet);
  passportCache.set(wallet, { ok: result, expiresAt: Date.now() + 90_000 });
  return result;
}

export async function balanceOf(wallet: string): Promise<boolean> {
  const data = "0x70a08231" + wallet.replace(/^0x/, "").padStart(64, "0");
  const payload = { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: passportContract, data }, "latest"] };
  const res = await fetch(passportRpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) return false;
  const body = await res.json();
  if (!body.result) return false;
  const balance = parseInt(body.result, 16);
  return balance > 0;
}

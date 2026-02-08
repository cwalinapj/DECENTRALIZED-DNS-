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
import { hashLeaf, verifyProof } from "../../../../ddns-core/dist/src/registry_merkle.js";

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
const poolDailyCap = Number(process.env.POOL_DAILY_CAP || 500);
const poolForfeitSplit = Number(process.env.POOL_FORFEIT_SPLIT || 0.5);
const bonusDailyCap = Number(process.env.COMMENTS_BONUS_DAILY_CAP || 20);
const treasuryPolicyPath = process.env.TREASURY_POLICY_PATH || path.resolve(process.cwd(), "../../..", "config/treasury-policy.json");
const governancePolicyPath = process.env.GOVERNANCE_POLICY_PATH || path.resolve(process.cwd(), "../../..", "policy/governance.json");
const governanceTimelockMs = Number(process.env.GOVERNANCE_TIMELOCK_MS || 24 * 60 * 60 * 1000);

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
const sitePools = new Map<string, number>();
const poolWindows = new Map<string, { date: string; credited: number }>();
const bonusWindows = new Map<string, { date: string; paid: number }>();
const nodeVerifications = new Map<string, { siteId: string; expiresAt: number }>();
let treasuryBalance = 0;
let treasuryPolicy: any = null;
let governancePolicy: any = null;
const treasuryAllocations: Array<{ ts: number; allocations: Record<string, number> }> = [];
const governanceQueue: Array<{ id: string; action: string; payload: any; executeAfter: number }> = [];

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
  const pools = loadJson("comments/pools.json", {});
  Object.entries(pools as Record<string, number>).forEach(([siteId, amount]) =>
    sitePools.set(siteId, amount)
  );
  const treasury = loadJson("comments/treasury.json", { balance: 0 });
  treasuryBalance = Number((treasury as { balance: number }).balance || 0);
  treasuryPolicy = loadJson(treasuryPolicyPath, null);
  governancePolicy = loadJson(governancePolicyPath, null);
}

function saveState() {
  const ledger: Record<string, number> = {};
  state.credits.forEach((value, key) => (ledger[key] = value));
  persistJson("credits/ledger.json", ledger);
  persistJson("credits/passports.json", Array.from(state.passports));
  persistJson("credits/receipts.json", Array.from(state.receipts.values()));
  persistJson("credits/windows.json", Array.from(creditWindows.entries()));
  persistJson("comments/holds.json", Array.from(comments.holds.values()));
  const pools: Record<string, number> = {};
  sitePools.forEach((value, key) => (pools[key] = value));
  persistJson("comments/pools.json", pools);
  persistJson("comments/treasury.json", { balance: treasuryBalance });
  persistJson("comments/allocations.json", treasuryAllocations);
  persistJson("governance/queue.json", governanceQueue);
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
    const hold = result.hold;
    if (body?.site_id && typeof body.site_id === "string") {
      hold.site_id = body.site_id;
    }
    if (body?.result === "approved") {
      const multiplier = Math.min(Number(body?.bonus_multiplier || 1), commentsBonusMax);
      const bonus = multiplier > 1 ? hold.amount * (multiplier - 1) : 0;
      if (bonus > 0) {
        if (!applyBonusCap(result.wallet, bonus)) {
          return sendJson(res, 400, { error: "bonus_cap_exceeded" });
        }
        const pool = sitePools.get(hold.site_id) || 0;
        if (pool >= bonus) {
          sitePools.set(hold.site_id, pool - bonus);
          const current = getBalance(state, result.wallet);
          state.credits.set(result.wallet, current + bonus);
        }
      }
    }
    if (body?.result === "spam" || body?.result === "trash") {
      const split = Number.isFinite(poolForfeitSplit) ? poolForfeitSplit : 0.5;
      const poolShare = hold.amount * Math.max(0, Math.min(split, 1));
      const treasuryShare = hold.amount - poolShare;
      const poolBalance = sitePools.get(hold.site_id) || 0;
      sitePools.set(hold.site_id, poolBalance + poolShare);
      treasuryBalance += treasuryShare;
    }
    saveState();
    return sendJson(res, 200, result);
  }

  if (req.method === "GET" && url.pathname === "/site-pool") {
    const siteId = url.searchParams.get("site_id") || "";
    const token = req.headers["x-ddns-site-token"];
    if (!commentsSiteToken || token !== commentsSiteToken) {
      return sendJson(res, 403, { error: "unauthorized" });
    }
    if (!siteId) return sendJson(res, 400, { error: "missing_site_id" });
    return sendJson(res, 200, { site_id: siteId, balance: sitePools.get(siteId) || 0 });
  }

  if (req.method === "POST" && url.pathname === "/node/verify") {
    const body = await readBody(req);
    const token = req.headers["x-ddns-site-token"];
    if (!commentsSiteToken || token !== commentsSiteToken) {
      return sendJson(res, 403, { error: "unauthorized" });
    }
    const entry = body?.entry;
    const proof = body?.proof;
    const root = body?.root;
    const siteId = body?.site_id;
    if (!entry || !proof || !root || !siteId) {
      return sendJson(res, 400, { error: "missing_fields" });
    }
    let ok = false;
    try {
      const leaf = hashLeaf(entry);
      ok = verifyProof(root, leaf, proof);
    } catch {
      ok = false;
    }
    if (!ok) return sendJson(res, 400, { error: "invalid_proof" });
    const verificationId = crypto.randomBytes(12).toString("hex");
    nodeVerifications.set(verificationId, { siteId, expiresAt: Date.now() + 10 * 60 * 1000 });
    return sendJson(res, 200, { verification_id: verificationId });
  }

  if (req.method === "POST" && url.pathname === "/node/receipts") {
    const body = await readBody(req);
    const token = req.headers["x-ddns-site-token"];
    if (!commentsSiteToken || token !== commentsSiteToken) {
      return sendJson(res, 403, { error: "unauthorized" });
    }
    const receipt = body?.receipt;
    const signature = body?.signature;
    const siteId = body?.site_id;
    if (!receipt || !signature || !siteId) {
      return sendJson(res, 400, { error: "missing_fields" });
    }
    const verificationId = receipt.verification_id || "";
    const verification = nodeVerifications.get(verificationId);
    if (!verification || verification.expiresAt < Date.now() || verification.siteId !== siteId) {
      return sendJson(res, 400, { error: "verification_required" });
    }
    const expected = crypto.createHmac("sha256", commentsSiteToken).update(JSON.stringify(receipt)).digest("hex");
    if (expected !== signature) {
      return sendJson(res, 400, { error: "invalid_signature" });
    }
    if (!applyPoolCap(siteId, 1)) {
      return sendJson(res, 400, { error: "pool_cap_exceeded" });
    }
    const pool = sitePools.get(siteId) || 0;
    sitePools.set(siteId, pool + 1);
    saveState();
    return sendJson(res, 200, { ok: true, balance: sitePools.get(siteId) || 0 });
  }

  if (req.method === "GET" && url.pathname === "/public/ledger") {
    const pools: Record<string, number> = {};
    sitePools.forEach((value, key) => (pools[key] = value));
    return sendJson(res, 200, {
      pools,
      treasury: treasuryBalance,
      totalCredits: Array.from(state.credits.values()).reduce((sum, val) => sum + val, 0)
    });
  }

  if (req.method === "GET" && url.pathname === "/treasury/policy") {
    return sendJson(res, 200, { policy: treasuryPolicy });
  }

  if (req.method === "GET" && url.pathname === "/treasury/ledger") {
    return sendJson(res, 200, {
      treasury: treasuryBalance,
      allocations: treasuryAllocations
    });
  }

  if (req.method === "POST" && url.pathname === "/treasury/allocate") {
    const token = req.headers["x-admin-token"];
    if (!adminToken || token !== adminToken) return sendJson(res, 403, { error: "unauthorized" });
    const policy = treasuryPolicy;
    if (!policy || !policy.buckets || !Array.isArray(policy.buckets)) {
      return sendJson(res, 400, { error: "policy_missing" });
    }
    const allocations: Record<string, number> = {};
    for (const bucket of policy.buckets) {
      const name = bucket.name;
      const pct = Number(bucket.percent || 0);
      allocations[name] = Math.floor(treasuryBalance * pct);
    }
    treasuryAllocations.push({ ts: Date.now(), allocations });
    saveState();
    return sendJson(res, 200, { allocations });
  }

  if (req.method === "GET" && url.pathname === "/governance/config") {
    return sendJson(res, 200, { policy: governancePolicy, timelock_ms: governanceTimelockMs });
  }

  if (req.method === "POST" && url.pathname === "/governance/queue") {
    const token = req.headers["x-admin-token"];
    if (!adminToken || token !== adminToken) return sendJson(res, 403, { error: "unauthorized" });
    const body = await readBody(req);
    if (!body?.action) return sendJson(res, 400, { error: "missing_action" });
    const id = crypto.randomBytes(12).toString("hex");
    const executeAfter = Date.now() + governanceTimelockMs;
    governanceQueue.push({ id, action: body.action, payload: body.payload || {}, executeAfter });
    saveState();
    return sendJson(res, 200, { id, executeAfter });
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

function applyPoolCap(siteId: string, delta: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const entry = poolWindows.get(siteId) || { date: today, credited: 0 };
  if (entry.date !== today) {
    entry.date = today;
    entry.credited = 0;
  }
  if (entry.credited + delta > poolDailyCap) {
    return false;
  }
  entry.credited += delta;
  poolWindows.set(siteId, entry);
  return true;
}

function applyBonusCap(wallet: string, delta: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const entry = bonusWindows.get(wallet) || { date: today, paid: 0 };
  if (entry.date !== today) {
    entry.date = today;
    entry.paid = 0;
  }
  if (entry.paid + delta > bonusDailyCap) {
    return false;
  }
  entry.paid += delta;
  bonusWindows.set(wallet, entry);
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

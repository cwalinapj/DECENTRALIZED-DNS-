import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { ethers } from "ethers";
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
import { hashLeaf, verifyProof, normalizeRegistryName } from "../../../../ddns-core/dist/src/registry_merkle.js";

const port = Number(process.env.PORT || 8822);
const dataDir = process.env.DATA_DIR || "./data";
const adminToken = process.env.ADMIN_TOKEN || "";
const sessionTtlMs = Number(process.env.SESSION_TTL_MS || 10 * 60 * 1000);
const authChain = process.env.AUTH_CHAIN || "auto";
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 1_000_000);
const allowCors = process.env.ALLOW_CORS === "1";
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
const publicLedgerEnabled = process.env.PUBLIC_LEDGER_ENABLED === "1";
const registrySnapshotPath = process.env.REGISTRY_PATH || path.resolve(process.cwd(), "../../..", "registry/snapshots/registry.json");

const state: CreditsState = {
  receipts: new Map(),
  credits: new Map(),
  passports: new Set(passportAllowlist),
  challenges: new Map(),
  rate: new Map()
};

const sessions = new Map<string, { nodeId: string; expiresAt: number; evmAddress?: string }>();
const authChallenges = new Map<string, { wallet: string; challenge: string; expiresAt: number }>();
const authBindings = new Map<string, { evmAddress: string; updatedAt: number }>();
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
const siteReceipts = new Map<string, Array<{ ts: number; type: string; payload: any }>>();

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (allowCors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    headers["Access-Control-Allow-Headers"] = "content-type,x-session-token,x-admin-token,x-ddns-site-token";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw new Error("payload_too_large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readBodyOrReject(req: IncomingMessage, res: ServerResponse) {
  try {
    return await readBody(req);
  } catch (err: any) {
    if (err?.message === "payload_too_large") {
      sendJson(res, 413, { error: "payload_too_large" });
      return null;
    }
    throw err;
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
  const bindings = loadJson("auth/bindings.json", {});
  Object.entries(bindings as Record<string, string>).forEach(([sol, evm]) => {
    if (sol && evm) authBindings.set(sol, { evmAddress: evm, updatedAt: Date.now() });
  });
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
  const receipts = loadJson("comments/receipts.json", {});
  Object.entries(receipts as Record<string, any[]>).forEach(([siteId, entries]) => {
    if (Array.isArray(entries)) {
      siteReceipts.set(siteId, entries);
    }
  });
}

function saveState() {
  const ledger: Record<string, number> = {};
  state.credits.forEach((value, key) => (ledger[key] = value));
  persistJson("credits/ledger.json", ledger);
  persistJson("credits/passports.json", Array.from(state.passports));
  const bindings: Record<string, string> = {};
  authBindings.forEach((entry, key) => (bindings[key] = entry.evmAddress));
  persistJson("auth/bindings.json", bindings);
  persistJson("credits/receipts.json", Array.from(state.receipts.values()));
  persistJson("credits/windows.json", Array.from(creditWindows.entries()));
  persistJson("comments/holds.json", Array.from(comments.holds.values()));
  const pools: Record<string, number> = {};
  sitePools.forEach((value, key) => (pools[key] = value));
  persistJson("comments/pools.json", pools);
  persistJson("comments/treasury.json", { balance: treasuryBalance });
  persistJson("comments/allocations.json", treasuryAllocations);
  persistJson("governance/queue.json", governanceQueue);
  const receipts: Record<string, any[]> = {};
  siteReceipts.forEach((entries, siteId) => (receipts[siteId] = entries));
  persistJson("comments/receipts.json", receipts);
}

loadState();
validatePassportEnv();

export function createCreditsServer() {
  return createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/auth/challenge") {
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
    const wallet = body?.sol_pubkey || body?.wallet;
    if (!wallet) return sendJson(res, 400, { error: "missing_wallet" });
    const chain = inferChain(wallet);
    if (!chain) return sendJson(res, 400, { error: "invalid_wallet_format" });
    if (authChain !== "auto" && chain !== authChain) {
      return sendJson(res, 400, { error: "auth_chain_mismatch" });
    }
    const challenge = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + sessionTtlMs;
    authChallenges.set(wallet, { wallet, challenge, expiresAt });
    return sendJson(res, 200, { wallet, chain, challenge, expiresAt });
  }

  if (req.method === "POST" && url.pathname === "/auth/verify") {
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
    const wallet = body?.sol_pubkey || body?.wallet;
    const signature = body?.sol_signature || body?.signature;
    if (!wallet || !signature) return sendJson(res, 400, { error: "missing_fields" });
    const chain = inferChain(wallet);
    if (!chain) return sendJson(res, 400, { error: "invalid_wallet_format" });
    if (authChain !== "auto" && chain !== authChain) {
      return sendJson(res, 400, { error: "auth_chain_mismatch" });
    }
    const challenge = authChallenges.get(wallet);
    if (!challenge || challenge.expiresAt < Date.now()) return sendJson(res, 400, { error: "challenge_expired" });
    const msg = `login\n${challenge.challenge}`;

    if (chain === "evm") {
      const evmAddress = wallet;
      const evmOk = await verifyEvmSignature(evmAddress, msg, signature);
      if (!evmOk) return sendJson(res, 403, { error: "invalid_signature" });
      if (passportEnabled) {
        validatePassportEnv();
        const owns = await passportOwns(evmAddress);
        if (!owns) return sendJson(res, 403, { error: "passport_required" });
      }
      const token = crypto.randomBytes(16).toString("hex");
      authChallenges.delete(wallet);
      sessions.set(token, { nodeId: evmAddress, evmAddress, expiresAt: Date.now() + sessionTtlMs });
      return sendJson(res, 200, { token, expiresAt: Date.now() + sessionTtlMs });
    }

    const solPubkey = wallet;
    const solOk = verifySolSignature(solPubkey, msg, signature);
    if (!solOk) return sendJson(res, 403, { error: "invalid_signature" });
    let evmAddress: string | undefined;
    if (passportEnabled || body?.evm_address) {
      evmAddress = body?.evm_address;
      const evmSig = body?.evm_signature;
      if (!evmAddress || !evmSig) return sendJson(res, 400, { error: "missing_evm_binding" });
      if (!isEvmAddress(evmAddress)) return sendJson(res, 400, { error: "invalid_evm_address" });
      const evmOk = await verifyEvmSignature(evmAddress, msg, evmSig);
      if (!evmOk) return sendJson(res, 403, { error: "invalid_evm_signature" });
      authBindings.set(solPubkey, { evmAddress, updatedAt: Date.now() });
      if (passportEnabled) {
        validatePassportEnv();
        const owns = await passportOwns(evmAddress);
        if (!owns) return sendJson(res, 403, { error: "passport_required" });
      }
    } else if (!state.passports.has(solPubkey)) {
      return sendJson(res, 403, { error: "passport_required" });
    }
    const token = crypto.randomBytes(16).toString("hex");
    authChallenges.delete(solPubkey);
    sessions.set(token, { nodeId: solPubkey, evmAddress, expiresAt: Date.now() + sessionTtlMs });
    return sendJson(res, 200, { token, expiresAt: Date.now() + sessionTtlMs });
  }

  if (req.method === "GET" && url.pathname === "/credits") {
    const wallet = url.searchParams.get("wallet") || "";
    if (!wallet) return sendJson(res, 400, { error: "missing_wallet" });
    if (!isEvmAddress(wallet) && !isSolPubkey(wallet)) {
      return sendJson(res, 400, { error: "invalid_wallet_format" });
    }
    return sendJson(res, 200, { wallet, balance: getBalance(state, wallet) });
  }

  if (req.method === "POST" && url.pathname === "/credits/spend") {
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
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
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
    const envelope = body as ReceiptEnvelope;
    const nodeId = envelope?.receipt?.node_id;
    if (!nodeId) return sendJson(res, 400, { error: "missing_node_id" });
    const before = getBalance(state, nodeId);
    const receiptId = receiptIdFromEnvelope(envelope);
    const result = await applyReceipt(state, envelope, {
      serveCredits,
      verifyCredits,
      storeCredits,
      resolverPubkeyHex: resolverPubkeyHex || undefined,
      allowUnverifiedServe,
      maxPerMinute
    });
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    const delta = creditDelta(envelope.receipt.type);
    if (!applyDailyCap(nodeId, delta)) {
      state.credits.set(nodeId, before);
      state.receipts.delete(receiptId);
      return sendJson(res, 400, { error: "credit_cap_exceeded" });
    }
    saveState();
    return sendJson(res, 200, { ok: true, balance: getBalance(state, nodeId) });
  }

  if (req.method === "POST" && url.pathname === "/comments/auth/challenge") {
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
    if (!body?.wallet) return sendJson(res, 400, { error: "missing_wallet" });
    if (!isEvmAddress(body.wallet)) return sendJson(res, 400, { error: "invalid_wallet_format" });
    const result = createCommentChallenge(commentAuth, body.wallet, commentsAuthTtlMs);
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/comments/auth/verify") {
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
    if (!body?.wallet || !body?.signature) return sendJson(res, 400, { error: "missing_fields" });
    if (!isEvmAddress(body.wallet)) return sendJson(res, 400, { error: "invalid_wallet_format" });
    const ok = verifyCommentSignature(commentAuth, body.wallet, body.signature);
    if (!ok) return sendJson(res, 403, { error: "invalid_signature" });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/comments/hold") {
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
    const token = req.headers["x-ddns-site-token"];
    if (!commentsSiteToken || token !== commentsSiteToken) {
      return sendJson(res, 403, { error: "unauthorized" });
    }
    if (body?.wallet && !isEvmAddress(body.wallet) && !isSolPubkey(body.wallet)) {
      return sendJson(res, 400, { error: "invalid_wallet_format" });
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
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
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
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
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
    const poolEntries = siteReceipts.get(hold.site_id) || [];
    poolEntries.unshift({
      ts: Date.now(),
      type: "comment_finalized",
      payload: {
        ticket_id: hold.ticket_id,
        result: body?.result,
        amount: hold.amount,
        wallet: hold.wallet
      }
    });
    siteReceipts.set(hold.site_id, poolEntries.slice(0, 200));
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
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
    const token = req.headers["x-ddns-site-token"];
    if (!commentsSiteToken || token !== commentsSiteToken) {
      return sendJson(res, 403, { error: "unauthorized" });
    }
    const entry = body?.entry;
    const proof = body?.proof;
    const root = body?.root;
    const siteId = body?.site_id;
    const authoritySig = body?.authority_sig;
    const resultHash = body?.result_hash;
    if (!entry || !proof || !root || !siteId) {
      return sendJson(res, 400, { error: "missing_fields" });
    }
    let ok = false;
    try {
      if (entry.owner) {
        const ownerRecord = Array.isArray(entry.records)
          ? entry.records.find((record: any) => String(record.type).toUpperCase() === "OWNER")
          : null;
        if (ownerRecord && ownerRecord.value && ownerRecord.value !== entry.owner) {
          return sendJson(res, 400, { error: "owner_mismatch" });
        }
      }
      const leaf = hashLeaf(entry);
      ok = verifyProof(root, leaf, proof);
    } catch {
      ok = false;
    }
    if (!ok) return sendJson(res, 400, { error: "invalid_proof" });
    if (resolverPubkeyHex) {
      if (!authoritySig || !resultHash) {
        return sendJson(res, 400, { error: "authority_sig_required" });
      }
      const msg = `resolve\n${resultHash}`;
      const verified = await verifyEd25519Message(resolverPubkeyHex, msg, authoritySig);
      if (!verified) return sendJson(res, 400, { error: "authority_sig_invalid" });
    }
    const verificationId = crypto.randomBytes(12).toString("hex");
    nodeVerifications.set(verificationId, { siteId, expiresAt: Date.now() + 10 * 60 * 1000 });
    return sendJson(res, 200, { verification_id: verificationId });
  }

  if (req.method === "POST" && url.pathname === "/node/receipts") {
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
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
    if (!receipt.node_name || !receipt.node_pubkey) {
      return sendJson(res, 400, { error: "missing_node_identity" });
    }
    const verificationId = receipt.verification_id || "";
    const verification = nodeVerifications.get(verificationId);
    if (!verification || verification.expiresAt < Date.now() || verification.siteId !== siteId) {
      return sendJson(res, 400, { error: "verification_required" });
    }
    const registryPubkey = getRegistryNodePubkey(receipt.node_name);
    if (!registryPubkey || !matchesRegistryPubkey(receipt.node_pubkey, registryPubkey)) {
      return sendJson(res, 400, { error: "node_pubkey_mismatch" });
    }
    if (!verifyNodeReceiptSignature(receipt, signature, receipt.node_pubkey)) {
      return sendJson(res, 400, { error: "invalid_signature" });
    }
    if (!applyPoolCap(siteId, 1)) {
      return sendJson(res, 400, { error: "pool_cap_exceeded" });
    }
    const pool = sitePools.get(siteId) || 0;
    sitePools.set(siteId, pool + 1);
    const entries = siteReceipts.get(siteId) || [];
    entries.unshift({ ts: Date.now(), type: "node_receipt", payload: receipt });
    siteReceipts.set(siteId, entries.slice(0, 200));
    saveState();
    return sendJson(res, 200, { ok: true, balance: sitePools.get(siteId) || 0 });
  }

  if (req.method === "GET" && url.pathname === "/site-pool/receipts") {
    const siteId = url.searchParams.get("site_id") || "";
    const token = req.headers["x-ddns-site-token"];
    if (!commentsSiteToken || token !== commentsSiteToken) {
      return sendJson(res, 403, { error: "unauthorized" });
    }
    if (!siteId) return sendJson(res, 400, { error: "missing_site_id" });
    return sendJson(res, 200, { site_id: siteId, receipts: siteReceipts.get(siteId) || [] });
  }

  if (req.method === "GET" && url.pathname === "/public/ledger") {
    if (!publicLedgerEnabled) return sendJson(res, 404, { error: "not_found" });
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
    let total = 0;
    for (const bucket of policy.buckets) {
      const name = bucket.name;
      let pct = Number(bucket.percent ?? bucket.fraction ?? 0);
      if (pct > 1) pct = pct / 100;
      total += pct;
      allocations[name] = Math.floor(treasuryBalance * pct);
    }
    if (total > 1.0001) {
      return sendJson(res, 400, { error: "bucket_total_exceeds_100" });
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
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
    if (!body?.action) return sendJson(res, 400, { error: "missing_action" });
    const id = crypto.randomBytes(12).toString("hex");
    const executeAfter = Date.now() + governanceTimelockMs;
    governanceQueue.push({ id, action: body.action, payload: body.payload || {}, executeAfter });
    saveState();
    return sendJson(res, 200, { id, executeAfter });
  }

  if (req.method === "POST" && url.pathname === "/audits/challenge") {
    const body = await readBodyOrReject(req, res);
    if (body === null) return;
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

function validatePassportEnv() {
  if (!passportEnabled) return;
  if (!passportRpc || !passportContract) {
    throw new Error("passport_env_missing");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(passportContract)) {
    throw new Error("passport_contract_invalid");
  }
}

function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isSolPubkey(value: string): boolean {
  try {
    const decoded = bs58.decode(value);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

function inferChain(value: string): "evm" | "solana" | null {
  if (authChain !== "auto") {
    if (authChain === "evm" || authChain === "solana") return authChain;
  }
  if (isEvmAddress(value)) return "evm";
  if (isSolPubkey(value)) return "solana";
  return null;
}

function decodeBase64OrBase58(input: string): Uint8Array | null {
  try {
    return bs58.decode(input);
  } catch {
    try {
      return new Uint8Array(Buffer.from(input, "base64"));
    } catch {
      return null;
    }
  }
}

function verifySolSignature(pubkey: string, message: string, signature: string): boolean {
  const pubBytes = bs58.decode(pubkey);
  const sigBytes = decodeBase64OrBase58(signature);
  if (!sigBytes) return false;
  return nacl.sign.detached.verify(new TextEncoder().encode(message), sigBytes, pubBytes);
}

async function verifyEvmSignature(address: string, message: string, signature: string): Promise<boolean> {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function verifyNodeReceiptSignature(receipt: any, signatureB64: string, nodePubkey: string): boolean {
  const pub = decodeEd25519Pubkey(nodePubkey);
  if (!pub) return false;
  const sig = Buffer.from(signatureB64, "base64");
  const message = `node_receipt\n${stableStringify(receipt)}`;
  return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pub);
}

function decodeEd25519Pubkey(input: string): Uint8Array | null {
  const cleaned = input.startsWith("ed25519:") ? input.slice("ed25519:".length) : input;
  try {
    return new Uint8Array(Buffer.from(cleaned, "base64"));
  } catch {
    return null;
  }
}

function loadRegistrySnapshot(): any | null {
  try {
    const raw = fs.readFileSync(registrySnapshotPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getRegistryNodePubkey(nodeName: string): string | null {
  const snapshot = loadRegistrySnapshot();
  if (!snapshot?.records) return null;
  const normalized = normalizeRegistryName(nodeName);
  const entry = snapshot.records.find((record: any) => normalizeRegistryName(record.name) === normalized);
  if (!entry) return null;
  const record = (entry.records || []).find((r: any) => String(r.type).toUpperCase() === "NODE_PUBKEY");
  return record?.value || null;
}

function matchesRegistryPubkey(receiptPubkey: string, registryPubkey: string): boolean {
  const a = receiptPubkey.startsWith("ed25519:") ? receiptPubkey : `ed25519:${receiptPubkey}`;
  const b = registryPubkey.startsWith("ed25519:") ? registryPubkey : `ed25519:${registryPubkey}`;
  return a === b;
}

export async function passportOwns(wallet: string): Promise<boolean> {
  if (!passportEnabled) return true;
  validatePassportEnv();
  if (!isEvmAddress(wallet)) return false;
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

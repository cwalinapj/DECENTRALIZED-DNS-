import express from "express";
import dnsPacket from "dns-packet";
import { blake3 } from "@noble/hashes/blake3";
import { utf8ToBytes, bytesToHex } from "@noble/hashes/utils";
import { verify as edVerify, getPublicKey, sign } from "@noble/ed25519";
import "./ed25519-setup.js";
import { verify as secpVerify } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import "./secp256k1-setup.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveEns } from "./ens.js";
import { resolveDnsRecord } from "./dns-registry.js";
import { EscrowReporter } from "./escrow-client.js";
import { validateVoucherShape } from "./voucher-types.js";
const PORT = Number(process.env.PORT || "8054");
const UPSTREAM_DOH_URL = process.env.UPSTREAM_DOH_URL || "https://cloudflare-dns.com/dns-query";
const TOR_DOH_URL = process.env.TOR_DOH_URL || "";
const RECEIPT_DIR = process.env.RECEIPT_DIR || path.join(process.cwd(), "receipts");
const OPERATOR_ID = process.env.OPERATOR_ID || "local-operator";
const OPERATOR_ROLE = process.env.OPERATOR_ROLE || "CORE_RESOLVER";
const BACKEND_ID = process.env.BACKEND_ID || "edge-ingress";
const POLICY_VERSION = process.env.POLICY_VERSION || "local";
const WINDOW_ID = process.env.WINDOW_ID || "local-0";
const RECEIPT_SIGNING_KEY_HEX = process.env.RECEIPT_SIGNING_KEY_HEX || "";
const RECEIPT_SIGNING_SCHEME = (process.env.RECEIPT_SIGNING_SCHEME || "ed25519").toLowerCase();
const TOLL_CURRENCY = (process.env.TOLL_CURRENCY || "").toLowerCase();
const ALLOW_UNAUTHENTICATED = process.env.ALLOW_UNAUTHENTICATED === "1";
const VOUCHER_PUBKEY_HEX = process.env.VOUCHER_PUBKEY_HEX || "";
const VOUCHER_MAX_AGE_SEC = Number(process.env.VOUCHER_MAX_AGE_SEC || "300");
const SESSION_TTL_SEC = Number(process.env.SESSION_TTL_SEC || "600");
const SESSION_MAX_REQUESTS = Number(process.env.SESSION_MAX_REQUESTS || "100");
const ENFORCE_TOLL_POLICY = process.env.ENFORCE_TOLL_POLICY === "1";
const TRUST_MIN_SCORE = Number(process.env.TRUST_MIN_SCORE || "700");
const ETH_FALLBACK_BASE = (process.env.ETH_FALLBACK_BASE || "").toLowerCase();
const SOL_FALLBACK_BASE = (process.env.SOL_FALLBACK_BASE || "").toLowerCase();
const DNS_FALLBACK_BASE = (process.env.DNS_FALLBACK_BASE || "rail.golf").toLowerCase();
const ENS_CACHE_TTL_MS = Number(process.env.ENS_CACHE_TTL_MS || "60000");
const FETCH_TIMEOUT_MS = 2000;
const ESCROW_URL = process.env.ESCROW_URL || "";
const ESCROW_MODE = (process.env.ESCROW_MODE || "off").toLowerCase();
const ESCROW_SETTLER_ID = process.env.ESCROW_SETTLER_ID || OPERATOR_ID;
const ESCROW_BATCH_SIZE = Number(process.env.ESCROW_BATCH_SIZE || "50");
const ESCROW_FLUSH_INTERVAL_MS = Number(process.env.ESCROW_FLUSH_INTERVAL_MS || "30000");
const TRDL_DOMAIN = (process.env.TRDL_DOMAIN || "").toLowerCase();
const REQUIRE_MINT_OWNER = process.env.REQUIRE_MINT_OWNER === "1";
const CACHE_WRITE_ALLOW_HEADER = process.env.CACHE_WRITE_ALLOW_HEADER || "x-ddns-wallet";
const usedNonces = new Map();
const nonceWindowMs = 10 * 60 * 1000;
const sessions = new Map();
const escrowReporter = new EscrowReporter({
    escrowUrl: ESCROW_URL || undefined,
    settlerId: ESCROW_SETTLER_ID,
    mode: ESCROW_MODE || "off",
    batchSize: ESCROW_BATCH_SIZE,
    flushIntervalMs: ESCROW_FLUSH_INTERVAL_MS
});

const mintCaches = new Map();

function base58Decode(input) {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const BASE = 58;
    let bytes = [0];
    for (const ch of input) {
        const val = ALPHABET.indexOf(ch);
        if (val < 0)
            return null;
        let carry = val;
        for (let j = 0; j < bytes.length; ++j) {
            carry += bytes[j] * BASE;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    for (const ch of input) {
        if (ch === "1")
            bytes.push(0);
        else
            break;
    }
    return Uint8Array.from(bytes.reverse());
}

function isBase58Pubkey(value) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function parseIdentityFromHost(host) {
    if (!host)
        return null;
    const lower = host.toLowerCase();
    const needle = ".trdl.";
    const idx = lower.indexOf(needle);
    if (idx <= 0)
        return null;
    const identity = lower.slice(0, idx);
    if (!identity || !isBase58Pubkey(identity))
        return null;
    return identity;
}

function canonicalize(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalize).join(",")}]`;
    const keys = Object.keys(value).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
    return `{${entries.join(",")}}`;
}

function payloadHashHex(payload) {
    return crypto.createHash("sha256").update(canonicalize(payload)).digest("hex");
}

async function fetchJsonRpc(method, params) {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const res = await fetch(SOLANA_RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
    });
    if (!res.ok)
        throw new Error(`rpc_${res.status}`);
    const json = await res.json();
    if (json.error)
        throw new Error(`rpc_${json.error?.message || "error"}`);
    return json.result;
}

async function mintExists(mint) {
    try {
        const result = await fetchJsonRpc("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
        return !!result?.value;
    }
    catch {
        return false;
    }
}

async function mintOwner(mint) {
    try {
        const largest = await fetchJsonRpc("getTokenLargestAccounts", [mint]);
        const acct = largest?.value?.[0]?.address;
        if (!acct)
            return null;
        const info = await fetchJsonRpc("getParsedAccountInfo", [acct, { encoding: "jsonParsed" }]);
        return info?.value?.data?.parsed?.info?.owner || null;
    }
    catch {
        return null;
    }
}
function nowSec() {
    return Math.floor(Date.now() / 1000);
}
function cleanupNonces() {
    const now = Date.now();
    for (const [key, ts] of usedNonces) {
        if (now - ts > nonceWindowMs)
            usedNonces.delete(key);
    }
}
function cleanupSessions() {
    const now = Date.now();
    for (const [token, sess] of sessions) {
        if (sess.expiresAt <= now || sess.remaining <= 0)
            sessions.delete(token);
    }
}
function hashHex(bytes) {
    return bytesToHex(blake3(bytes, { dkLen: 32 }));
}
function decodeBase64Url(input) {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (input.length % 4)) % 4);
    return Buffer.from(padded, "base64");
}
function rewriteName(qname) {
    const lower = qname.toLowerCase();
    if (lower.endsWith(".eth") && ETH_FALLBACK_BASE) {
        return `${lower}.${ETH_FALLBACK_BASE}`;
    }
    if (lower.endsWith(".sol") && SOL_FALLBACK_BASE) {
        return `${lower}.${SOL_FALLBACK_BASE}`;
    }
    if (lower.endsWith(".dns") && DNS_FALLBACK_BASE) {
        return `${lower}.${DNS_FALLBACK_BASE}`;
    }
    return qname;
}
function voucherPayload(v) {
    return `${v.account}|${v.amount}|${v.currency}|${v.nonce}|${v.ts}`;
}
async function validateVoucher(raw) {
    if (ALLOW_UNAUTHENTICATED)
        return { ok: true };
    if (!raw)
        return { ok: false, error: "missing_voucher" };
    if (!VOUCHER_PUBKEY_HEX)
        return { ok: false, error: "voucher_pubkey_missing" };
    let v;
    try {
        v = JSON.parse(raw);
    }
    catch {
        return { ok: false, error: "invalid_voucher_json" };
    }
    const shapeError = validateVoucherShape(v);
    if (shapeError) {
        return { ok: false, error: shapeError };
    }
    const age = Math.abs(nowSec() - v.ts);
    if (age > VOUCHER_MAX_AGE_SEC)
        return { ok: false, error: "voucher_expired" };
    cleanupNonces();
    const nonceKey = `${v.account}:${v.nonce}`;
    if (usedNonces.has(nonceKey))
        return { ok: false, error: "voucher_replay" };
    const payload = utf8ToBytes(voucherPayload(v));
    const sig = Uint8Array.from(Buffer.from(v.sig.replace(/^0x/, ""), "hex"));
    const pub = Uint8Array.from(Buffer.from(VOUCHER_PUBKEY_HEX.replace(/^0x/, ""), "hex"));
    const ok = await edVerify(sig, payload, pub);
    if (!ok)
        return { ok: false, error: "voucher_sig_invalid" };
    usedNonces.set(nonceKey, Date.now());
    return { ok: true, voucher: v };
}
function schemeForCurrency(currency) {
    const c = currency.toLowerCase();
    if (["sol", "wsol", "spl_usdc", "usdc_spl"].includes(c))
        return "ed25519";
    if (["eth", "usdc_erc20"].includes(c))
        return "secp256k1";
    return "ed25519";
}
async function verifySessionSignature(req) {
    const payload = `${req.account}|${req.currency}|${req.nonce}|${req.ts}|${req.ttl ?? ""}|${req.max_requests ?? ""}`;
    const msg = utf8ToBytes(payload);
    const sigBytes = Uint8Array.from(Buffer.from(req.sig.replace(/^0x/, ""), "hex"));
    const pubBytes = Uint8Array.from(Buffer.from(req.pubkey.replace(/^0x/, ""), "hex"));
    const scheme = schemeForCurrency(req.currency);
    if (scheme === "secp256k1") {
        const digest = keccak_256(msg);
        const sig = sigBytes.length === 65 ? sigBytes.slice(0, 64) : sigBytes;
        return secpVerify(sig, digest, pubBytes);
    }
    return edVerify(sigBytes, msg, pubBytes);
}
async function resolveVia(url, query) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/dns-message",
                "accept": "application/dns-message"
            },
            body: Buffer.from(query),
            signal: controller.signal
        });
        if (!res.ok) {
            throw new Error(`upstream_${res.status}`);
        }
        const arr = new Uint8Array(await res.arrayBuffer());
        return arr;
    }
    catch (err) {
        if (err?.name === "AbortError") {
            throw new Error("upstream_timeout");
        }
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
}
async function resolveUpstream(query) {
    return resolveVia(UPSTREAM_DOH_URL, query);
}
function stableStringify(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
    return `{${entries.join(",")}}`;
}
async function signReceipt(payload, currencyOverride) {
    if (!RECEIPT_SIGNING_KEY_HEX) {
        return { scheme: "none", public_key: "", sig: "" };
    }
    const priv = Uint8Array.from(Buffer.from(RECEIPT_SIGNING_KEY_HEX.replace(/^0x/, ""), "hex"));
    const msg = utf8ToBytes(stableStringify(payload));
    const currency = (currencyOverride || TOLL_CURRENCY || "").toLowerCase();
    const scheme = RECEIPT_SIGNING_SCHEME !== "auto"
        ? RECEIPT_SIGNING_SCHEME
        : ["sol", "wsol", "spl_usdc", "usdc_spl"].includes(currency)
            ? "ed25519"
            : "secp256k1";
    if (scheme === "secp256k1") {
        const { getPublicKey: secpGetPublicKey, sign: secpSign } = await import("@noble/secp256k1");
        const { keccak_256 } = await import("@noble/hashes/sha3");
        const { bytesToHex } = await import("./secp256k1-helpers.js");
        await import("./secp256k1-setup.js");
        const pub = secpGetPublicKey(priv, false);
        const digest = keccak_256(msg);
        const sig = await secpSign(digest, priv);
        const sigBytes = sig.toCompactRawBytes();
        return {
            scheme: "secp256k1",
            public_key: bytesToHex(pub),
            sig: bytesToHex(sigBytes)
        };
    }
    const pub = await getPublicKey(priv);
    const sig = await sign(msg, priv);
    return {
        scheme: "ed25519",
        public_key: "0x" + Buffer.from(pub).toString("hex"),
        sig: "0x" + Buffer.from(sig).toString("hex")
    };
}
function writeReceipt(payload) {
    fs.mkdirSync(RECEIPT_DIR, { recursive: true });
    const name = `${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
    fs.writeFileSync(path.join(RECEIPT_DIR, name), JSON.stringify(payload, null, 2));
}
const app = express();
app.use(express.json({ limit: "64kb" }));
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.post("/session", async (req, res) => {
    try {
        const body = req.body;
        if (!body?.account || !body?.currency || !body?.nonce || !body?.sig || !body?.pubkey || !Number.isFinite(body.ts)) {
            return res.status(400).json({ ok: false, error: "invalid_session_request" });
        }
        const age = Math.abs(nowSec() - Number(body.ts));
        if (age > VOUCHER_MAX_AGE_SEC)
            return res.status(401).json({ ok: false, error: "session_expired" });
        cleanupNonces();
        const nonceKey = `session:${body.account}:${body.nonce}`;
        if (usedNonces.has(nonceKey))
            return res.status(409).json({ ok: false, error: "session_replay" });
        const verified = await verifySessionSignature(body);
        if (!verified)
            return res.status(401).json({ ok: false, error: "session_sig_invalid" });
        const requestedTtl = Number.isFinite(body.ttl) ? Number(body.ttl) : SESSION_TTL_SEC;
        const requestedMax = Number.isFinite(body.max_requests) ? Number(body.max_requests) : SESSION_MAX_REQUESTS;
        const ttl = Math.max(30, Math.min(requestedTtl, SESSION_TTL_SEC));
        const maxRequests = Math.max(1, Math.min(requestedMax, SESSION_MAX_REQUESTS));
        const token = crypto.randomBytes(24).toString("base64url");
        const expiresAt = Date.now() + ttl * 1000;
        const scheme = schemeForCurrency(body.currency);
        sessions.set(token, {
            account: body.account,
            currency: body.currency,
            expiresAt,
            remaining: maxRequests,
            scheme,
            pubkey: body.pubkey
        });
        usedNonces.set(nonceKey, Date.now());
        return res.json({
            ok: true,
            token,
            expires_in: ttl,
            max_requests: maxRequests,
            scheme
        });
    }
    catch (err) {
        return res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
});
app.get("/dns-query", async (req, res) => {
    try {
        const host = req.headers["host"] || "";
        const identity = parseIdentityFromHost(host);
        if (!identity) {
            return res.status(400).json({ ok: false, error: "invalid_identity_host" });
        }
        if (!(await mintExists(identity))) {
            return res.status(400).json({ ok: false, error: "mint_not_found" });
        }
        if (ENFORCE_TOLL_POLICY) {
            const credits = Number(req.header("x-ddns-credits") || "0");
            const trustScore = Number(req.header("x-ddns-trust-score") || "0");
            const featureUsage = (req.header("x-ddns-feature-usage") || "").split(",").map((v) => v.trim()).filter(Boolean);
            if (!Number.isFinite(credits) || credits <= 0) {
                return res.status(402).json({ ok: false, error: "insufficient_credits" });
            }
            if (!Number.isFinite(trustScore) || trustScore < TRUST_MIN_SCORE) {
                return res.status(403).json({ ok: false, error: "trust_score_too_low" });
            }
            if (featureUsage.length === 0) {
                return res.status(403).json({ ok: false, error: "no_feature_usage" });
            }
        }
        const sessionHeader = req.header("x-ddns-session") || "";
        let payerAccount = "";
        let payerCurrency = "";
        let payerAmount = null;
        let voucherForSettlement;
        if (sessionHeader) {
            cleanupSessions();
            const sess = sessions.get(sessionHeader);
            if (!sess || sess.expiresAt <= Date.now()) {
                sessions.delete(sessionHeader);
                return res.status(401).json({ ok: false, error: "invalid_session" });
            }
            if (sess.remaining <= 0) {
                sessions.delete(sessionHeader);
                return res.status(429).json({ ok: false, error: "session_exhausted" });
            }
            sess.remaining -= 1;
            payerAccount = sess.account;
            payerCurrency = sess.currency;
        }
        else {
            const voucherHeader = req.header("x-ddns-voucher") || req.header("x-ddns-voucher-json");
            const voucherCheck = await validateVoucher(voucherHeader || undefined);
            if (!voucherCheck.ok)
                return res.status(401).json({ ok: false, error: voucherCheck.error });
            if (voucherCheck.voucher) {
                payerAccount = voucherCheck.voucher.account;
                payerCurrency = voucherCheck.voucher.currency;
                payerAmount = voucherCheck.voucher.amount;
                voucherForSettlement = voucherCheck.voucher;
            }
        }
        const dnsParam = typeof req.query.dns === "string" ? req.query.dns : undefined;
        const nameParam = typeof req.query.name === "string" ? req.query.name : undefined;
        let query;
        let qname = "";
        let qtype = "A";
        let ensInfo = null;
        let dnsRecord = null;
        if (dnsParam) {
            query = decodeBase64Url(dnsParam);
            const decoded = dnsPacket.decode(query);
            qname = decoded?.questions?.[0]?.name || "";
            qtype = decoded?.questions?.[0]?.type || "A";
            if (qname.toLowerCase().endsWith(".dns")) {
                dnsRecord = await resolveDnsRecord(qname);
            }
            if (qname.toLowerCase().endsWith(".eth")) {
                ensInfo = await resolveEns(qname, ENS_CACHE_TTL_MS);
            }
            const rewritten = rewriteName(qname);
            if (rewritten !== qname && decoded?.questions?.[0]) {
                decoded.questions[0].name = rewritten;
                query = Buffer.from(dnsPacket.encode(decoded));
                qname = rewritten;
            }
        }
        else if (nameParam) {
            qname = nameParam;
            qtype = "A";
            if (qname.toLowerCase().endsWith(".dns")) {
                dnsRecord = await resolveDnsRecord(qname);
            }
            if (qname.toLowerCase().endsWith(".eth")) {
                ensInfo = await resolveEns(qname, ENS_CACHE_TTL_MS);
            }
            const rewritten = rewriteName(qname);
            qname = rewritten;
            query = Buffer.from(dnsPacket.encode({
                type: "query",
                id: Math.floor(Math.random() * 65535),
                flags: dnsPacket.RECURSION_DESIRED,
                questions: [{ type: "A", name: qname, class: "IN" }]
            }));
        }
        else {
            return res.status(400).json({ ok: false, error: "missing_dns_or_name" });
        }
        const cacheKey = `${identity}:${qname.toLowerCase()}:${qtype}`;
        const idCache = mintCaches.get(identity);
        if (idCache && idCache.has(cacheKey)) {
            const entry = idCache.get(cacheKey);
            if (entry && entry.expiresAt > Date.now()) {
                const decoded = dnsPacket.decode(query);
                const id = decoded?.id || Math.floor(Math.random() * 65535);
                const answers = [{ type: entry.rrtype, name: qname, class: "IN", ttl: entry.ttl, data: entry.value }];
                const response = dnsPacket.encode({
                    type: "response",
                    id,
                    flags: dnsPacket.RECURSION_DESIRED,
                    questions: decoded.questions,
                    answers
                });
                return res
                    .set("content-type", "application/dns-message")
                    .send(Buffer.from(response));
            }
        }
        let response;
        if (dnsRecord?.a || dnsRecord?.cname) {
            const decoded = dnsPacket.decode(query);
            const id = decoded?.id || Math.floor(Math.random() * 65535);
            const answers = [];
            if (dnsRecord.a) {
                answers.push({ type: "A", name: qname, class: "IN", ttl: 60, data: dnsRecord.a });
            }
            if (dnsRecord.cname) {
                answers.push({ type: "CNAME", name: qname, class: "IN", ttl: 60, data: dnsRecord.cname });
            }
            response = dnsPacket.encode({
                type: "response",
                id,
                flags: dnsPacket.RECURSION_DESIRED | dnsPacket.RECURSION_AVAILABLE,
                questions: decoded?.questions || [],
                answers
            });
        }
        else {
            if (qname.toLowerCase().endsWith(".onion") && TOR_DOH_URL) {
                response = await resolveVia(TOR_DOH_URL, query);
            }
            else {
                response = await resolveUpstream(query);
            }
        }
        const responseHash = hashHex(response);
        const requestHash = hashHex(query);
        if (voucherForSettlement) {
            escrowReporter.record(voucherForSettlement, requestHash);
        }
        const nameHash = hashHex(utf8ToBytes(qname));
        const receiptBase = {
            receipt_version: "v1",
            receipt_type: "PER_REQUEST",
            operator_id: OPERATOR_ID,
            operator_role: OPERATOR_ROLE,
            backend_id: BACKEND_ID,
            policy_version: POLICY_VERSION,
            window_id: WINDOW_ID,
            timestamp_ms: Date.now(),
            payer: payerAccount
                ? {
                    account: payerAccount,
                    currency: payerCurrency || undefined,
                    amount: payerAmount ?? undefined
                }
                : undefined,
            service_summary: {
                request_count: 1,
                success_count: 1,
                error_count: 0,
                bytes_served_total: response.length
            },
            integrity: {
                request_hash: requestHash,
                response_hash: responseHash,
                request_hash_scheme: "blake3-256",
                response_hash_scheme: "blake3-256",
                name_hash: nameHash
            }
        };
        const signature = await signReceipt(receiptBase, payerCurrency);
        const receipt = { ...receiptBase, signature };
        writeReceipt(receipt);
        const wantsJson = req.query.json === "1";
        if (wantsJson) {
            const decoded = dnsPacket.decode(Buffer.from(response));
            return res.json({ ok: true, response: decoded, receipt, ens: ensInfo || undefined, dns: dnsRecord || undefined });
        }
        res.setHeader("content-type", "application/dns-message");
        return res.send(Buffer.from(response));
    }
    catch (err) {
        const msg = String(err?.message || err);
        if (msg === "upstream_timeout") {
            return res.status(504).json({ ok: false, error: { code: "UPSTREAM_TIMEOUT", message: msg, retryable: true } });
        }
        if (msg.startsWith("upstream_")) {
            return res.status(502).json({ ok: false, error: { code: "UPSTREAM_ERROR", message: msg, retryable: true } });
        }
        return res.status(502).json({ ok: false, error: { code: "INTERNAL", message: msg, retryable: false } });
    }
});
app.post("/cache/upsert", async (req, res) => {
    try {
        const body = req.body || {};
        const { mint, wallet_pubkey, name, rrtype, value, ttl, ts, sig } = body;
        if (!mint || !wallet_pubkey || !name || !rrtype || !value || !ttl || !ts || !sig) {
            return res.status(400).json({ ok: false, error: "missing_fields" });
        }
        if (!isBase58Pubkey(mint) || !isBase58Pubkey(wallet_pubkey)) {
            return res.status(400).json({ ok: false, error: "invalid_pubkey" });
        }
        if (!(await mintExists(mint))) {
            return res.status(400).json({ ok: false, error: "mint_not_found" });
        }
        if (REQUIRE_MINT_OWNER) {
            const owner = await mintOwner(mint);
            if (!owner || owner !== wallet_pubkey) {
                return res.status(403).json({ ok: false, error: "owner_mismatch" });
            }
        }
        const payload = {
            mint,
            wallet_pubkey,
            name,
            rrtype,
            value,
            ttl,
            ts
        };
        const hashHex = payloadHashHex(payload);
        const sigBytes = Buffer.from(sig, "base64");
        const pubBytes = base58Decode(wallet_pubkey);
        if (!pubBytes || !(await edVerify(sigBytes, Buffer.from(hashHex, "hex"), pubBytes))) {
            return res.status(403).json({ ok: false, error: "sig_invalid" });
        }
        const cacheKey = `${mint}:${name.toLowerCase()}:${rrtype}`;
        const expiresAt = Date.now() + Math.min(Number(ttl), 3600) * 1000;
        const bucket = mintCaches.get(mint) || new Map();
        bucket.set(cacheKey, { rrtype, value, ttl: Number(ttl), expiresAt, wallet_pubkey });
        mintCaches.set(mint, bucket);
        return res.json({ ok: true, route_id: hashHex });
    }
    catch (err) {
        return res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
});
app.listen(PORT, () => {
    console.log(`resolver listening on :${PORT}`);
});

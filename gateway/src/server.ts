import express from "express";
import dnsPacket from "dns-packet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyVoucherHeader } from "./voucher.js";
import { buildMerkleRoot, buildProof, loadSnapshot, normalizeName, verifyProof } from "./registry.js";
import { resolveEns, supportsEns } from "./adapters/ens.js";
import { resolveSns, supportsSns } from "./adapters/sns.js";
import {
  createAdapterRegistry,
  createEnsAdapter,
  createIpfsAdapter,
  createPkdnsAdapter,
  createRecursiveAdapter,
  createSnsAdapter
} from "./adapters/index.js";
import { anchorRoot, loadAnchorStore, type AnchorRecord } from "./anchor.js";
import { hash as blake3 } from "blake3";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import crypto from "node:crypto";
import {
  AttackMode,
  defaultThresholdsFromEnv,
  evaluateAttackMode,
  policyForMode
} from "@ddns/attack-mode";
import { createCacheLogger, computeRrsetHashFromAnswers } from "./cache_log.js";
import {
  createNoticeToken,
  verifyNoticeToken,
  type DomainContinuityPhase
} from "./lib/notice_token.js";
import {
  evaluateDomainContinuityPolicy,
  type DomainTrafficSignal
} from "./lib/domain_continuity_policy.js";
import { createDomainStatusStore } from "./lib/domain_status_store.js";
import { createRegistrarProvider, parseRegistrarProvider } from "./lib/registrar_provider.js";

const PORT = Number(process.env.PORT || "8054");
const HOST = process.env.HOST || "0.0.0.0";
const RECURSIVE_UPSTREAMS = (
  process.env.RECURSIVE_UPSTREAMS ||
  process.env.UPSTREAM_DOH_URLS ||
  "https://cloudflare-dns.com/dns-query,https://dns.google/dns-query"
)
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const UPSTREAM_DOH_URL = process.env.UPSTREAM_DOH_URL || "https://cloudflare-dns.com/dns-query";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || "5000");
const CACHE_TTL_MAX_S = Number(process.env.CACHE_TTL_MAX_S || process.env.TTL_CAP_S || "300");
const CACHE_PATH = process.env.CACHE_PATH || "gateway/.cache/rrset.json";
const STALE_MAX_S = Number(process.env.STALE_MAX_S || "1800");
const PREFETCH_FRACTION = Number(process.env.PREFETCH_FRACTION || "0.1");
const CACHE_MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || "50000");
const RECURSIVE_QUORUM_MIN = Number(process.env.RECURSIVE_QUORUM_MIN || "2");
const RECURSIVE_TIMEOUT_MS = Number(process.env.RECURSIVE_TIMEOUT_MS || "2000");
const RECURSIVE_MAX_CONCURRENCY = Number(process.env.RECURSIVE_MAX_CONCURRENCY || "3");
const RECURSIVE_OVERLAP_RATIO = Number(process.env.RECURSIVE_OVERLAP_RATIO || "0.34");
const CACHE_LOG_ENABLED = process.env.CACHE_LOG_ENABLED === "1";
const CACHE_SPOOL_PATH = process.env.CACHE_SPOOL_PATH || "gateway/.cache/cache_entries.jsonl";
const CACHE_ROLLUP_URL = process.env.CACHE_ROLLUP_URL || "";
const CACHE_PARENT_EXTRACT_RULE = process.env.CACHE_PARENT_EXTRACT_RULE || "last2-dns";
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "development" ? "verbose" : "quiet");
const GATED_SUFFIXES = (process.env.GATED_SUFFIXES || ".premium")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const REGISTRY_ENABLED = process.env.REGISTRY_ENABLED === "1";
const REGISTRY_PATH = process.env.REGISTRY_PATH || "registry/snapshots/registry.json";
const ENABLE_ENS = process.env.ENABLE_ENS === "1";
const ENABLE_SNS = process.env.ENABLE_SNS === "1";
const ETH_RPC_URL = process.env.ETH_RPC_URL || "";
const ENS_NETWORK = process.env.ENS_NETWORK || "mainnet";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const SNS_CLUSTER = process.env.SNS_CLUSTER || "devnet";
const ANCHOR_STORE_PATH = process.env.ANCHOR_STORE_PATH || "settlement/anchors/anchors.json";
const WATCHDOG_POLICY_PROGRAM_ID = process.env.DDNS_WATCHDOG_POLICY_PROGRAM_ID || "";
const IPFS_HTTP_GATEWAY_BASE_URL = process.env.IPFS_HTTP_GATEWAY_BASE_URL || "https://ipfs.io/ipfs";
const DDNS_REGISTRY_PROGRAM_ID = process.env.DDNS_REGISTRY_PROGRAM_ID || "";
const DDNS_WITNESS_URL = process.env.DDNS_WITNESS_URL || "";
const REGISTRY_ADMIN_TOKEN = process.env.REGISTRY_ADMIN_TOKEN || "";
const NODE_AGGREGATOR_ENABLED = process.env.NODE_AGGREGATOR_ENABLED === "1";
const NODE_LIST_PATH = process.env.NODE_LIST_PATH || "config/example/nodes.json";
const NODE_QUORUM = Number(process.env.NODE_QUORUM || 3);
const RESOLVER_PRIVATE_KEY_HEX = process.env.RESOLVER_PRIVATE_KEY_HEX || "";
const RESOLVER_PUBKEY_HEX = process.env.RESOLVER_PUBKEY_HEX || "";
const TRDL_DOMAIN = (process.env.TRDL_DOMAIN || "").toLowerCase();
const REQUIRE_MINT_OWNER = process.env.REQUIRE_MINT_OWNER === "1";
const SOLANA_RPC_URL_FOR_MINT = process.env.SOLANA_RPC_URL || SOLANA_RPC_URL;
const ATTACK_MODE_ENABLED = process.env.ATTACK_MODE_ENABLED === "1";
const ATTACK_WINDOW_SECS = Number(process.env.ATTACK_WINDOW_SECS || "120");
const DOMAIN_CONTINUITY_POLICY_VERSION = process.env.DOMAIN_CONTINUITY_POLICY_VERSION || "mvp-2026-02";
const DOMAIN_STATUS_STORE_PATH = process.env.DOMAIN_STATUS_STORE_PATH || "gateway/.cache/domain_status.json";
const MOCK_REGISTRAR_STORE_PATH = process.env.MOCK_REGISTRAR_STORE_PATH || "gateway/.cache/mock_registrar.json";
const REGISTRAR_ENABLED = process.env.REGISTRAR_ENABLED === "1";
const REGISTRAR_PROVIDER = parseRegistrarProvider(process.env.REGISTRAR_PROVIDER || "mock");
const PORKBUN_API_KEY = process.env.PORKBUN_API_KEY || "";
const PORKBUN_SECRET_API_KEY = process.env.PORKBUN_SECRET_API_KEY || "";
const PORKBUN_ENDPOINT = process.env.PORKBUN_ENDPOINT || "https://api.porkbun.com/api/json/v3";
const REGISTRAR_DRY_RUN =
  process.env.REGISTRAR_DRY_RUN !== undefined
    ? process.env.REGISTRAR_DRY_RUN === "1"
    : REGISTRAR_ENABLED && !PORKBUN_API_KEY;
const BANNER_TEMPLATE_PATH =
  process.env.DOMAIN_BANNER_TEMPLATE_PATH || path.resolve(process.cwd(), "gateway/public/domain-continuity/banner.html");
const INTERSTITIAL_TEMPLATE_PATH =
  process.env.DOMAIN_INTERSTITIAL_TEMPLATE_PATH ||
  path.resolve(process.cwd(), "gateway/public/domain-continuity/interstitial.html");
const attackThresholds = defaultThresholdsFromEnv(process.env);

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

function logInfo(message: string) {
  if (LOG_LEVEL !== "quiet") {
    console.log(message);
  }
}

type AttackCounters = {
  windowStartUnix: number;
  totalReq: number;
  gatewayErr: number;
  rpcTotal: number;
  rpcErr: number;
};

const attackCounters: AttackCounters = {
  windowStartUnix: Math.floor(Date.now() / 1000),
  totalReq: 0,
  gatewayErr: 0,
  rpcTotal: 0,
  rpcErr: 0
};

let attackMode: AttackMode = AttackMode.NORMAL;
let attackMemory: { lastStableUnix?: number } = {};
let attackDecision: { score: number; reasons: string[] } = { score: 0, reasons: [] };

function normalizeDomainInput(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readTemplate(templatePath: string, fallback: string): string {
  try {
    if (fs.existsSync(templatePath)) {
      return fs.readFileSync(templatePath, "utf8");
    }
  } catch {}
  return fallback;
}

function renderHtmlTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => escapeHtml(vars[key] || ""));
}

function inferTrafficSignal(lastSeenAt?: string | null): DomainTrafficSignal {
  if (!lastSeenAt) return "none";
  const ts = Date.parse(lastSeenAt);
  if (Number.isNaN(ts)) return "none";
  const ageMs = Date.now() - ts;
  if (ageMs <= 2 * 24 * 60 * 60 * 1000) return "real";
  if (ageMs <= 14 * 24 * 60 * 60 * 1000) return "low";
  return "none";
}

function continuityStatus(
  domainRaw: string,
  options: {
    nsStatus?: boolean;
    verifiedControl?: boolean;
    trafficSignal?: DomainTrafficSignal;
    renewalDueDate?: string;
    lastSeenAt?: string;
    abuseFlag?: boolean;
    claimRequested?: boolean;
    creditsBalance?: number;
  } = {}
) {
  const domain = normalizeDomainInput(domainRaw);
  const now = Date.now();
  const renewalDueDate =
    options.renewalDueDate || new Date(now + 1000 * 60 * 60 * 24 * 20).toISOString();
  const graceExpiresAt = new Date(now + 1000 * 60 * 60 * 24 * 35).toISOString();
  const policy = evaluateDomainContinuityPolicy({
    domain,
    ns_status: options.nsStatus ?? true,
    verified_control: options.verifiedControl ?? false,
    traffic_signal: options.trafficSignal ?? inferTrafficSignal(options.lastSeenAt),
    renewal_due_date: renewalDueDate,
    last_seen_at: options.lastSeenAt,
    abuse_flag: options.abuseFlag ?? false
  });

  const reasonCodes = [...policy.reason_codes];
  const nextSteps = [...policy.next_steps];
  if (options.claimRequested) {
    reasonCodes.push("CLAIM_REQUESTED");
    nextSteps.push("Claim is queued for policy review");
  }

  return {
    domain,
    eligible: policy.eligible,
    phase: policy.phase as DomainContinuityPhase,
    reason_codes: [...new Set(reasonCodes)],
    next_steps: [...new Set(nextSteps)],
    credits_balance: options.creditsBalance ?? 120,
    credits_applied_estimate: policy.credits_estimate,
    renewal_due_date: renewalDueDate,
    grace_expires_at: graceExpiresAt,
    policy_version: DOMAIN_CONTINUITY_POLICY_VERSION,
    auth_required: false,
    auth_mode: "stub" as const
  };
}



async function continuityStatusFromSources(
  domainRaw: string,
  options: {
    nsStatus?: boolean;
    verifiedControl?: boolean;
    trafficSignal?: DomainTrafficSignal;
    renewalDueDate?: string;
    lastSeenAt?: string;
    abuseFlag?: boolean;
    claimRequested?: boolean;
    creditsBalance?: number;
  } = {}
) {
  const existingRecord = await registrarAdapter.getDomain(domainRaw);
  const registrarNs = existingRecord.ns || [];
  const registrarNsStatus = registrarNs.some((entry) => entry.endsWith("tolldns.io"));

  return continuityStatus(domainRaw, {
    nsStatus: options.nsStatus ?? registrarNsStatus,
    verifiedControl: options.verifiedControl,
    trafficSignal: options.trafficSignal ?? existingRecord.traffic_signal,
    renewalDueDate: options.renewalDueDate ?? existingRecord.renewal_due_date,
    lastSeenAt: options.lastSeenAt,
    abuseFlag: options.abuseFlag,
    claimRequested: options.claimRequested,
    creditsBalance: options.creditsBalance ?? existingRecord.credits_balance
  });
}

function resetAttackWindow(nowUnix: number) {
  if (nowUnix - attackCounters.windowStartUnix >= ATTACK_WINDOW_SECS) {
    attackCounters.windowStartUnix = nowUnix;
    attackCounters.totalReq = 0;
    attackCounters.gatewayErr = 0;
    attackCounters.rpcTotal = 0;
    attackCounters.rpcErr = 0;
  }
}

function currentAttackPolicy(nowUnix: number) {
  resetAttackWindow(nowUnix);
  if (!ATTACK_MODE_ENABLED) {
    attackMode = AttackMode.NORMAL;
    attackDecision = { score: 0, reasons: ["disabled"] };
    return policyForMode(attackMode);
  }
  const rpcFailPct = attackCounters.rpcTotal
    ? (attackCounters.rpcErr * 100) / attackCounters.rpcTotal
    : 0;
  const gatewayErrPct = attackCounters.totalReq
    ? (attackCounters.gatewayErr * 100) / attackCounters.totalReq
    : 0;
  const decision = evaluateAttackMode(
    attackMode,
    { rpcFailPct, gatewayErrorPct: gatewayErrPct, nowUnix },
    attackThresholds,
    attackMemory
  );
  attackMode = decision.nextMode;
  attackMemory = decision.memory;
  attackDecision = { score: decision.score, reasons: decision.reasons };
  return policyForMode(attackMode);
}

const recursiveAdapter = createRecursiveAdapter({
  upstreamDohUrls: RECURSIVE_UPSTREAMS,
  cachePath: CACHE_PATH,
  staleMaxS: STALE_MAX_S,
  prefetchFraction: PREFETCH_FRACTION,
  cacheMaxEntries: CACHE_MAX_ENTRIES,
  requestTimeoutMs: RECURSIVE_TIMEOUT_MS,
  maxConcurrency: RECURSIVE_MAX_CONCURRENCY,
  quorumMin: RECURSIVE_QUORUM_MIN,
  overlapRatio: RECURSIVE_OVERLAP_RATIO,
  ttlCapS: CACHE_TTL_MAX_S
});

const adapterRegistry = createAdapterRegistry({
  pkdns: createPkdnsAdapter({
    solanaRpcUrl: SOLANA_RPC_URL,
    ddnsRegistryProgramId: DDNS_REGISTRY_PROGRAM_ID,
    ddnsWatchdogPolicyProgramId: WATCHDOG_POLICY_PROGRAM_ID || undefined
  }),
  recursive: recursiveAdapter,
  ipfs: createIpfsAdapter({ httpGateways: [IPFS_HTTP_GATEWAY_BASE_URL] }),
  ens: createEnsAdapter({ rpcUrl: ETH_RPC_URL, chainId: 1 }),
  sns: createSnsAdapter({ rpcUrl: SOLANA_RPC_URL })
});

const cacheLogger = createCacheLogger({
  enabled: CACHE_LOG_ENABLED,
  spoolPath: CACHE_SPOOL_PATH,
  rollupUrl: CACHE_ROLLUP_URL || undefined,
  parentExtractRule: CACHE_PARENT_EXTRACT_RULE
});
const domainStatusStore = createDomainStatusStore(DOMAIN_STATUS_STORE_PATH);
const registrarRuntime = createRegistrarProvider({
  enabled: REGISTRAR_ENABLED,
  provider: REGISTRAR_PROVIDER,
  dryRun: REGISTRAR_DRY_RUN,
  storePath: MOCK_REGISTRAR_STORE_PATH,
  porkbunApiKey: PORKBUN_API_KEY,
  porkbunSecretApiKey: PORKBUN_SECRET_API_KEY,
  porkbunEndpoint: PORKBUN_ENDPOINT
});
const registrarAdapter = registrarRuntime.adapter;

const cache = new Map<string, { expiresAt: number; payload: ResolveResponse }>();
const mintCaches = new Map<string, Map<string, { rrtype: string; value: string; ttl: number; expiresAt: number; wallet_pubkey: string }>>();

export type ResolveRecord = { type: string; value: string | { key: string; value: string }; ttl?: number };
export type ResolveResponse = {
  name: string;
  network: string;
  records: ResolveRecord[];
  metadata: Record<string, unknown>;
};

function cacheGet(key: string): ResolveResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key: string, ttlMs: number, payload: ResolveResponse) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, payload });
}

function base58Decode(input: string): Uint8Array | null {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const BASE = 58;
  let bytes = [0];
  for (const ch of input) {
    const val = ALPHABET.indexOf(ch);
    if (val < 0) return null;
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
    if (ch === "1") bytes.push(0);
    else break;
  }
  return Uint8Array.from(bytes.reverse());
}

function isBase58Pubkey(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function parseIdentityFromHost(host: string | undefined): string | null {
  if (!host) return null;
  const lower = host.toLowerCase();
  const needle = ".trdl.";
  const idx = lower.indexOf(needle);
  if (idx <= 0) return null;
  const identity = lower.slice(0, idx);
  if (!identity || !isBase58Pubkey(identity)) return null;
  if (TRDL_DOMAIN && !lower.endsWith(`.trdl.${TRDL_DOMAIN}`)) return null;
  return identity;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${entries.join(",")}}`;
}

function payloadHashHex(payload: unknown): string {
  return crypto.createHash("sha256").update(canonicalize(payload)).digest("hex");
}

async function fetchJsonRpc(method: string, params: unknown[]) {
  attackCounters.rpcTotal += 1;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const res = await fetch(SOLANA_RPC_URL_FOR_MINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
  if (!res.ok) {
    attackCounters.rpcErr += 1;
    throw new Error(`rpc_${res.status}`);
  }
  const json = await res.json();
  if (json.error) {
    attackCounters.rpcErr += 1;
    throw new Error(`rpc_${json.error?.message || "error"}`);
  }
  return json.result;
}

async function mintExists(mint: string): Promise<boolean> {
  try {
    const result = await fetchJsonRpc("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
    return !!result?.value;
  } catch {
    return false;
  }
}

async function mintOwner(mint: string): Promise<string | null> {
  try {
    const largest = await fetchJsonRpc("getTokenLargestAccounts", [mint]);
    const acct = largest?.value?.[0]?.address;
    if (!acct) return null;
    const info = await fetchJsonRpc("getParsedAccountInfo", [acct, { encoding: "jsonParsed" }]);
    return info?.value?.data?.parsed?.info?.owner || null;
  } catch {
    return null;
  }
}

async function resolveViaDoh(name: string): Promise<{ records: ResolveRecord[]; ttl: number }> {
  const query = dnsPacket.encode({
    type: "query",
    id: Math.floor(Math.random() * 65535),
    flags: dnsPacket.RECURSION_DESIRED,
    questions: [{ type: "A", name, class: "IN" }]
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(UPSTREAM_DOH_URL, {
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
    const decoded = dnsPacket.decode(Buffer.from(arr)) as any;
    const answers = Array.isArray(decoded.answers) ? decoded.answers : [];

    const records = answers
      .filter((a: any) => a && a.type && a.data)
      .map((a: any) => ({ type: String(a.type), value: String(a.data), ttl: a.ttl }));

    const ttl = records.length > 0
      ? Math.max(30, Math.min(CACHE_TTL_MAX_S, Number(records[0].ttl || 60)))
      : 60;

    return { records, ttl };
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("upstream_timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveVia(url: string, queryBytes: Buffer): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/dns-message",
        "accept": "application/dns-message"
      },
      body: queryBytes,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`upstream_${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("upstream_timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function createApp() {
  const app = express();

  app.use("/dns-query", express.raw({ type: ["application/dns-message"], limit: "512kb" }));

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.get("/v1/registrar/domain", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const record = await registrarAdapter.getDomain(domain);
    return res.json({
      ...record,
      registrar_enabled: registrarRuntime.enabled,
      provider: registrarRuntime.provider,
      dry_run: registrarRuntime.dryRun
    });
  });

  app.get("/v1/registrar/quote", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const quote = await registrarAdapter.getRenewalQuote(domain);
    return res.json({
      domain: normalizeDomainInput(domain),
      ...quote,
      registrar_enabled: registrarRuntime.enabled,
      provider: registrarRuntime.provider,
      dry_run: registrarRuntime.dryRun
    });
  });

  app.post("/v1/registrar/renew", express.json(), async (req, res) => {
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const years = Number(req.body?.years || 1);
    const quote = await registrarAdapter.getRenewalQuote(domain);
    const domainInfo = await registrarAdapter.getDomain(domain);
    const credits = Number(domainInfo.credits_balance || 0);
    const requiredCredits = Math.ceil(Number(quote.price_usd || 0) * 10);
    const coveredCredits = Math.min(requiredCredits, credits);
    if (requiredCredits > coveredCredits) {
      return res.json({
        domain: normalizeDomainInput(domain),
        years,
        status: "insufficient_credits",
        required_usd: Number(quote.price_usd || 0),
        covered_usd: Number((coveredCredits / 10).toFixed(2)),
        remaining_usd: Number(((requiredCredits - coveredCredits) / 10).toFixed(2)),
        instruction: "Add continuity credits or fallback to registrar payment flow",
        registrar_enabled: registrarRuntime.enabled,
        provider: registrarRuntime.provider,
        dry_run: registrarRuntime.dryRun
      });
    }
    const result = await registrarAdapter.renewDomain(domain, years, {
      use_credits: true,
      credits_amount: coveredCredits,
      payment_method: "credits"
    });
    return res.json({
      domain: normalizeDomainInput(domain),
      years,
      ...result,
      status: result.submitted ? "submitted" : "failed",
      required_usd: Number(quote.price_usd || 0),
      covered_usd: Number((coveredCredits / 10).toFixed(2)),
      remaining_usd: 0,
      registrar_enabled: registrarRuntime.enabled,
      provider: registrarRuntime.provider,
      dry_run: registrarRuntime.dryRun
    });
  });

  app.post("/v1/registrar/ns", express.json(), async (req, res) => {
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    const ns = Array.isArray(req.body?.ns) ? req.body.ns : [];
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const result = await registrarAdapter.setNameServers(domain, ns);
    return res.json({
      domain: normalizeDomainInput(domain),
      ns,
      ...result,
      registrar_enabled: registrarRuntime.enabled,
      provider: registrarRuntime.provider,
      dry_run: registrarRuntime.dryRun
    });
  });

  app.get("/v1/domain/status", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const ownerPubkey = typeof req.header("X-Owner-Pubkey") === "string" ? req.header("X-Owner-Pubkey") : "";
    const existing = domainStatusStore.get(domain);
    const registrarDomain = await registrarAdapter.getDomain(domain);
    const status = await continuityStatusFromSources(domain, {
      nsStatus: existing?.inputs?.ns_status ?? registrarDomain.ns.some((entry) => entry.endsWith("tolldns.io")),
      verifiedControl: existing?.inputs?.verified_control ?? false,
      trafficSignal: existing?.inputs?.traffic_signal ?? registrarDomain.traffic_signal ?? "none",
      renewalDueDate: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || undefined,
      lastSeenAt: existing?.inputs?.last_seen_at || undefined,
      abuseFlag: existing?.inputs?.abuse_flag ?? false,
      claimRequested: existing?.claim_requested ?? false,
      creditsBalance: registrarDomain.credits_balance
    });
    const persisted = domainStatusStore.upsert(domain, (current) => ({
      domain: normalizeDomainInput(domain),
      ...current,
      status,
      inputs: {
        domain: normalizeDomainInput(domain),
        ns_status: existing?.inputs?.ns_status ?? registrarDomain.ns.some((entry) => entry.endsWith("tolldns.io")),
        verified_control: existing?.inputs?.verified_control ?? false,
        traffic_signal: existing?.inputs?.traffic_signal ?? registrarDomain.traffic_signal ?? "none",
        renewal_due_date: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || status.renewal_due_date,
        last_seen_at: new Date().toISOString(),
        abuse_flag: existing?.inputs?.abuse_flag ?? false
      },
      last_updated_at: new Date().toISOString()
    }));
    return res.json({
      ...status,
      txt_record_name: persisted.challenge?.txt_record_name || null,
      txt_record_value: persisted.challenge?.txt_record_value || null,
      owner_pubkey: ownerPubkey || null,
      notice_signature: "mvp-local-policy"
    });
  });

  app.post("/v1/domain/verify", express.json(), (req, res) => {
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const normalized = normalizeDomainInput(domain);
    const updated = domainStatusStore.createChallenge(normalized);
    return res.json({
      domain: normalized,
      verification_method: "dns_txt",
      txt_record_name: updated.challenge?.txt_record_name,
      txt_record_value: updated.challenge?.txt_record_value,
      verification_token: updated.challenge?.token,
      expires_at: updated.challenge?.expires_at,
      auth_required: false,
      auth_mode: "stub",
      policy_version: DOMAIN_CONTINUITY_POLICY_VERSION
    });
  });

  app.post("/v1/domain/renew", express.json(), async (req, res) => {
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const useCredits = req.body?.use_credits !== false;
    const years = Number(req.body?.years || 1);
    const renewal = await registrarAdapter.renewDomain(domain, years, { use_credits: useCredits });
    const existing = domainStatusStore.get(domain);
    const registrarDomain = await registrarAdapter.getDomain(domain);
    const status = await continuityStatusFromSources(domain, {
      nsStatus: existing?.inputs?.ns_status ?? registrarDomain.ns.some((entry) => entry.endsWith("tolldns.io")),
      verifiedControl: existing?.inputs?.verified_control ?? false,
      trafficSignal: existing?.inputs?.traffic_signal ?? registrarDomain.traffic_signal ?? "none",
      renewalDueDate: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || undefined,
      lastSeenAt: existing?.inputs?.last_seen_at || undefined,
      abuseFlag: existing?.inputs?.abuse_flag ?? false,
      claimRequested: existing?.claim_requested ?? false,
      creditsBalance: registrarDomain.credits_balance
    });
    domainStatusStore.upsert(domain, (current) => ({
      domain: normalizeDomainInput(domain),
      ...current,
      status,
      last_updated_at: new Date().toISOString()
    }));
    return res.json({
      domain: status.domain,
      accepted: renewal.submitted,
      message: renewal.submitted ? "submitted_to_mock_registrar" : "stubbed: pending integration",
      reason_codes: renewal.errors,
      credits_applied_estimate: useCredits ? status.credits_applied_estimate : 0,
      renewal_due_date: status.renewal_due_date,
      grace_expires_at: status.grace_expires_at,
      auth_required: false,
      auth_mode: "stub",
      policy_version: DOMAIN_CONTINUITY_POLICY_VERSION,
      notice_signature: "mvp-local-policy"
    });
  });

  app.post("/v1/domain/continuity/claim", express.json(), async (req, res) => {
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const existing = domainStatusStore.get(domain);
    const registrarDomain = await registrarAdapter.getDomain(domain);
    const status = await continuityStatusFromSources(domain, {
      nsStatus: existing?.inputs?.ns_status ?? registrarDomain.ns.some((entry) => entry.endsWith("tolldns.io")),
      verifiedControl: existing?.inputs?.verified_control ?? false,
      trafficSignal: existing?.inputs?.traffic_signal ?? registrarDomain.traffic_signal ?? "none",
      renewalDueDate: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || undefined,
      lastSeenAt: existing?.inputs?.last_seen_at || undefined,
      abuseFlag: existing?.inputs?.abuse_flag ?? false,
      claimRequested: true,
      creditsBalance: registrarDomain.credits_balance
    });
    domainStatusStore.upsert(domain, (current) => ({
      domain: normalizeDomainInput(domain),
      ...current,
      claim_requested: true,
      claim_requested_at: new Date().toISOString(),
      status,
      last_updated_at: new Date().toISOString()
    }));
    return res.json({
      domain: status.domain,
      accepted: status.eligible,
      eligible: status.eligible,
      phase: status.phase,
      reason_codes: status.reason_codes,
      next_steps: status.next_steps,
      auth_required: false,
      auth_mode: "stub",
      policy_version: DOMAIN_CONTINUITY_POLICY_VERSION,
      notice_signature: "mvp-local-policy"
    });
  });

  app.get("/v1/domain/notice", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const existing = domainStatusStore.get(domain);
    const registrarDomain = await registrarAdapter.getDomain(domain);
    const status = await continuityStatusFromSources(domain, {
      nsStatus: existing?.inputs?.ns_status ?? registrarDomain.ns.some((entry) => entry.endsWith("tolldns.io")),
      verifiedControl: existing?.inputs?.verified_control ?? false,
      trafficSignal: existing?.inputs?.traffic_signal ?? registrarDomain.traffic_signal ?? "none",
      renewalDueDate: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || undefined,
      lastSeenAt: existing?.inputs?.last_seen_at || undefined,
      abuseFlag: existing?.inputs?.abuse_flag ?? false,
      claimRequested: existing?.claim_requested ?? false,
      creditsBalance: registrarDomain.credits_balance
    });
    const now = new Date();
    const { token, pubkey } = await createNoticeToken({
      domain: status.domain,
      phase: status.phase,
      issued_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 1000 * 60 * 15).toISOString(),
      reason_codes: status.reason_codes,
      policy_version: DOMAIN_CONTINUITY_POLICY_VERSION,
      nonce: crypto.randomBytes(8).toString("hex")
    });
    return res.json({ domain: status.domain, phase: status.phase, token, pubkey });
  });

  app.post("/v1/domain/notice/verify", express.json(), async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!token) return res.status(400).json({ error: "missing_token" });
    const result = await verifyNoticeToken(token);
    return res.json(result);
  });

  app.get("/v1/domain/banner", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });

    const existing = domainStatusStore.get(domain);
    const registrarDomain = await registrarAdapter.getDomain(domain);
    const status = await continuityStatusFromSources(domain, {
      nsStatus: existing?.inputs?.ns_status ?? registrarDomain.ns.some((entry) => entry.endsWith("tolldns.io")),
      verifiedControl: existing?.inputs?.verified_control ?? false,
      trafficSignal: existing?.inputs?.traffic_signal ?? registrarDomain.traffic_signal ?? "none",
      renewalDueDate: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || undefined,
      lastSeenAt: existing?.inputs?.last_seen_at || undefined,
      abuseFlag: existing?.inputs?.abuse_flag ?? false,
      claimRequested: existing?.claim_requested ?? false,
      creditsBalance: registrarDomain.credits_balance
    });

    const now = new Date();
    const { token } = await createNoticeToken({
      domain: status.domain,
      phase: status.phase,
      issued_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 1000 * 60 * 15).toISOString(),
      reason_codes: status.reason_codes,
      policy_version: DOMAIN_CONTINUITY_POLICY_VERSION,
      nonce: crypto.randomBytes(8).toString("hex")
    });

    const baseUrl = `${req.protocol}://${req.get("host") || "127.0.0.1:8054"}`;
    const verifyUrl = `${baseUrl}/v1/domain/notice/verify`;
    const dashboardUrl = `${baseUrl}/domain-continuity/index.html?domain=${encodeURIComponent(status.domain)}`;
    const renewUrl = dashboardUrl;
    const forceMode = typeof req.query.mode === "string" ? req.query.mode.toLowerCase() : "";
    const useInterstitial =
      forceMode === "interstitial" || (forceMode !== "banner" && (status.phase === "C_SAFE_PARKED" || status.phase === "D_REGISTRY_FINALIZATION"));
    const fallbackTemplate =
      "<!doctype html><html><body><h1>{{domain}}</h1><p>{{phase}}</p><a href=\"{{renew_url}}\">Renew now</a><pre>{{token}}</pre><code>{{verify_url}}</code></body></html>";
    const template = useInterstitial
      ? readTemplate(INTERSTITIAL_TEMPLATE_PATH, fallbackTemplate)
      : readTemplate(BANNER_TEMPLATE_PATH, fallbackTemplate);
    const html = renderHtmlTemplate(template, {
      domain: status.domain,
      phase: status.phase,
      renew_url: renewUrl,
      dashboard_url: dashboardUrl,
      token,
      verify_url: verifyUrl
    });
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  });

  app.get("/v1/attack-mode", (_req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const policy = currentAttackPolicy(now);
    return res.json({
      ok: true,
      enabled: ATTACK_MODE_ENABLED,
      mode: attackMode,
      decision: attackDecision,
      policy,
      window: {
        secs: ATTACK_WINDOW_SECS,
        totalReq: attackCounters.totalReq,
        gatewayErr: attackCounters.gatewayErr,
        rpcTotal: attackCounters.rpcTotal,
        rpcErr: attackCounters.rpcErr
      }
    });
  });

  // Attack-mode write gate: certain endpoints are treated as "writes" (centralized in MVP).
  app.use((req, res, next) => {
    const now = Math.floor(Date.now() / 1000);
    const policy = currentAttackPolicy(now);
    const isWrite = req.method !== "GET" && (req.path.startsWith("/cache/") || req.path.startsWith("/registry/anchor"));
    if (isWrite && policy.freezeWrites) {
      return res.status(503).json({ error: "attack_mode_freeze_writes", mode: attackMode, reasons: attackDecision.reasons });
    }
    return next();
  });

  // Normalized "route answer" API: stable shape for adapters across naming/content systems.
  //
  // We keep both endpoints:
  // - `/v1/route` is the primary MVP gateway endpoint used by tests/docs/scripts.
  // - `/v1/resolve-adapter` is a legacy alias from an earlier PR series.
  async function handleRoute(req: express.Request, res: express.Response) {
    try {
      const name = typeof req.query.name === "string" ? req.query.name : "";
      if (!name) return res.status(400).json({ error: "missing_name" });
      const ans = await adapterRegistry.resolveAuto({
        name,
        nowUnix: Math.floor(Date.now() / 1000),
        network: "gateway",
        opts: {
          timeoutMs: REQUEST_TIMEOUT_MS,
          // Optional "proof-of-observation" helper: if caller supplies dest, PKDNS can validate it against on-chain dest_hash.
          dest: typeof req.query.dest === "string" ? req.query.dest : undefined,
          // MVP resolve+verify: fetch candidate dest off-chain (witness) then verify against canonical dest_hash.
          witnessUrl:
            typeof req.query.witness_url === "string"
              ? req.query.witness_url
              : DDNS_WITNESS_URL
                ? DDNS_WITNESS_URL
                : undefined
        }
      });
      return res.json(ans);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const status =
        msg === "NO_ADAPTER_MATCH" || msg === "NOT_FOUND"
          ? 404
          : msg.endsWith("TIMEOUT")
            ? 502
            : 500;
      return res.status(status).json({ error: msg });
    }
  }

  app.get("/v1/route", handleRoute);
  app.get("/v1/resolve-adapter", handleRoute);

  app.get("/v1/resolve", async (req, res) => {
    try {
      const name = typeof req.query.name === "string" ? req.query.name : "";
      const type = typeof req.query.type === "string" ? req.query.type.toUpperCase() : "A";
      if (!name) return res.status(400).json({ error: "missing_name" });

      if (name.toLowerCase().endsWith(".dns")) {
        const ans = await adapterRegistry.resolveAuto({
          name,
          nowUnix: Math.floor(Date.now() / 1000),
          network: "gateway",
          opts: {
            timeoutMs: REQUEST_TIMEOUT_MS,
            qtype: type,
            dest: typeof req.query.dest === "string" ? req.query.dest : undefined,
            witnessUrl:
              typeof req.query.witness_url === "string"
                ? req.query.witness_url
                : DDNS_WITNESS_URL
                  ? DDNS_WITNESS_URL
                  : undefined
          }
        });
        if (cacheLogger.enabled && ans?.ttlS) {
          const rrsetHashHex =
            (ans.destHashHex || "").replace(/^0x/, "") ||
            String(ans.canonical?.destHashHex || "").replace(/^0x/, "");
          if (rrsetHashHex.length === 64) {
            await cacheLogger.logEntry({
              name,
              rrsetHashHex,
              ttlS: Number(ans.ttlS || 60),
              confidenceBps: Number(ans.source?.confidenceBps || 5000)
            });
          }
        }
        return res.json(ans);
      }

      const out = await recursiveAdapter.resolveRecursive(name, type);
      if (cacheLogger.enabled && out?.answers?.length) {
        const rrsetHashHex = computeRrsetHashFromAnswers(out.name, out.type, out.answers);
        await cacheLogger.logEntry({
          name: out.name,
          rrsetHashHex,
          ttlS: Number(out.ttlS || 60),
          confidenceBps: out.source === "stale" ? 7000 : 9000
        });
      }
      return res.json({
        name: out.name,
        type: out.type,
        answers: out.answers,
        ttl_s: out.ttlS,
        source: "recursive",
        confidence: out.confidence,
        upstreams_used: out.upstreamsUsed,
        chosen_upstream: out.chosenUpstream,
        cache: {
          hit: out.source === "cache",
          ...(out.source === "stale" ? { stale_used: true } : {})
        },
        status: out.status,
        rrset_hash: out.rrsetHash
      });
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message || err) });
    }
  });

  app.post("/cache/upsert", express.json(), async (req, res) => {
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
      const payload = { mint, wallet_pubkey, name, rrtype, value, ttl, ts };
      const hashHex = payloadHashHex(payload);
      const sigBytes = Buffer.from(sig, "base64");
      const pubBytes = base58Decode(wallet_pubkey);
      if (!pubBytes || !(await ed.verify(sigBytes, Buffer.from(hashHex, "hex"), pubBytes))) {
        return res.status(403).json({ ok: false, error: "sig_invalid" });
      }
      const cacheKey = `${mint}:${name.toLowerCase()}:${rrtype}`;
      const expiresAt = Date.now() + Math.min(Number(ttl), 3600) * 1000;
      const bucket = mintCaches.get(mint) || new Map();
      bucket.set(cacheKey, { rrtype, value, ttl: Number(ttl), expiresAt, wallet_pubkey });
      mintCaches.set(mint, bucket);
      return res.json({ ok: true, route_id: hashHex });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  app.get("/registry/root", (_req, res) => {
    if (!REGISTRY_ENABLED) {
      return res.status(501).json({ error: { code: "REGISTRY_DISABLED", message: "registry not enabled" } });
    }
    const snapshot = loadSnapshot(REGISTRY_PATH);
    const root = buildMerkleRoot(snapshot.records);
    const anchor = loadAnchorStore(ANCHOR_STORE_PATH).latest;
    return res.json({ root, version: snapshot.version, updatedAt: snapshot.updatedAt, anchoredRoot: anchor });
  });

  app.get("/registry/proof", (req, res) => {
    if (!REGISTRY_ENABLED) {
      return res.status(501).json({ error: { code: "REGISTRY_DISABLED", message: "registry not enabled" } });
    }
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!name) return res.status(400).json({ error: "missing_name" });
    const snapshot = loadSnapshot(REGISTRY_PATH);
    const proof = buildProof(snapshot.records, name);
    return res.json({
      root: proof.root,
      leaf: proof.leaf,
      siblings: proof.proof.siblings,
      directions: proof.proof.directions,
      version: snapshot.version,
      updatedAt: snapshot.updatedAt
    });
  });

  app.post("/registry/anchor", express.json(), (req, res) => {
    if (!REGISTRY_ENABLED) {
      return res.status(501).json({ error: { code: "REGISTRY_DISABLED", message: "registry not enabled" } });
    }
    const token = typeof req.headers["x-admin-token"] === "string" ? req.headers["x-admin-token"] : "";
    if (!REGISTRY_ADMIN_TOKEN || token !== REGISTRY_ADMIN_TOKEN) {
      return res.status(403).json({ error: { code: "UNAUTHORIZED", message: "admin token required" } });
    }
    const body = req.body as Partial<AnchorRecord>;
    if (!body?.root || !body?.version || !body?.timestamp || !body?.source) {
      return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "missing anchor fields" } });
    }
    const record: AnchorRecord = {
      root: String(body.root),
      version: Number(body.version),
      timestamp: String(body.timestamp),
      source: String(body.source)
    };
    const anchored = anchorRoot(record, ANCHOR_STORE_PATH);
    return res.json({ anchored });
  });

  app.get("/resolve", async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!name) return res.status(400).json({ error: "missing_name" });
    attackCounters.totalReq += 1;
    const proofRequested = req.query.proof === "1" || req.query.proof === "true";

    const lowered = name.toLowerCase();
    const gated = GATED_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
    if (gated) {
      const voucherHeader = typeof req.headers["x-ddns-voucher"] === "string"
        ? req.headers["x-ddns-voucher"]
        : "";
      const voucherCheck = verifyVoucherHeader(voucherHeader);
      if (!voucherCheck.ok) {
        const status = voucherCheck.code === "VOUCHER_REQUIRED"
          ? 402
          : voucherCheck.code === "VOUCHER_NOT_IMPLEMENTED"
            ? 501
            : 403;
        return res.status(status).json({
          error: {
            code: voucherCheck.code,
            message: voucherCheck.message,
            retryable: voucherCheck.retryable
          }
        });
      }
    }

    if (lowered.endsWith(".dns") && !REGISTRY_ENABLED) {
      return res.status(501).json({
        error: { code: "REGISTRY_DISABLED", message: "registry not enabled", retryable: false }
      });
    }

    if (REGISTRY_ENABLED && lowered.endsWith(".dns")) {
      const snapshot = loadSnapshot(REGISTRY_PATH);
      const normalized = normalizeName(name);
      const entry = snapshot.records.find((record) => normalizeName(record.name) === normalized);
      if (!entry) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "record not found", retryable: false } });
      }
      const computedRoot = buildMerkleRoot(snapshot.records);
      const anchor = loadAnchorStore(ANCHOR_STORE_PATH).latest;
      if (anchor && anchor.root !== computedRoot) {
        return res.status(409).json({
          error: { code: "ANCHOR_MISMATCH", message: "anchored root does not match snapshot", retryable: false }
        });
      }
      const root = anchor?.root || computedRoot;
      const proof = proofRequested ? buildProof(snapshot.records, name) : null;
      if (proofRequested && proof && !verifyProof(root, proof.leaf, proof.proof)) {
        return res.status(500).json({
          error: { code: "PROOF_INVALID", message: "proof failed to verify", retryable: false }
        });
      }
      const payload: ResolveResponse = {
        name,
        network: "dns",
        records: entry.records,
        metadata: {
          source: "registry",
          registryVersion: snapshot.version,
          registryUpdatedAt: snapshot.updatedAt,
          root,
          ...(proofRequested && proof ? {
            proof: {
              root,
              version: snapshot.version,
              leaf: proof.leaf,
              siblings: proof.proof.siblings,
              directions: proof.proof.directions
            }
          } : {})
        }
      };
      attachAuthoritySig(payload);
      const policy = currentAttackPolicy(Math.floor(Date.now() / 1000));
      if (policy.ttlClampS > 0) {
        payload.records = payload.records.map((r) => ({
          ...r,
          ttl: Math.min(Number(r.ttl ?? policy.ttlClampS), policy.ttlClampS)
        }));
      }
      return res.json(payload);
    }

    if (ENABLE_ENS && supportsEns(name)) {
      try {
        const records = await resolveEns(name, { rpcUrl: ETH_RPC_URL, timeoutMs: REQUEST_TIMEOUT_MS });
        if (!records.length) {
          return res.status(404).json({ error: { code: "NOT_FOUND", message: "ENS record not found", retryable: false } });
        }
        const payload: ResolveResponse = {
          name,
          network: "ens",
          records,
          metadata: {
            source: "ens",
            network: ENS_NETWORK
          }
        };
        attachAuthoritySig(payload);
        return res.json(payload);
      } catch (err: any) {
        const msg = String(err?.message || err);
        const code = msg === "ENS_TIMEOUT" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
        return res.status(502).json({ error: { code, message: msg, retryable: true } });
      }
    }

    if (ENABLE_SNS && supportsSns(name)) {
      try {
        const records = await resolveSns(name, { rpcUrl: SOLANA_RPC_URL, timeoutMs: REQUEST_TIMEOUT_MS });
        if (!records.length) {
          return res.status(404).json({ error: { code: "NOT_FOUND", message: "SNS record not found", retryable: false } });
        }
        const payload: ResolveResponse = {
          name,
          network: "sns",
          records,
          metadata: {
            source: "sns",
            cluster: SNS_CLUSTER
          }
        };
        attachAuthoritySig(payload);
        return res.json(payload);
      } catch (err: any) {
        const msg = String(err?.message || err);
        const code = msg === "SNS_TIMEOUT" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
        return res.status(502).json({ error: { code, message: msg, retryable: true } });
      }
    }

    const cacheKey = `resolve:${name.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, metadata: { ...cached.metadata, cache: "hit" } });
    }

    try {
      const { records, ttl } = await resolveViaDoh(name);
      const policy = currentAttackPolicy(Math.floor(Date.now() / 1000));
      const effectiveTtl = policy.ttlClampS > 0 ? Math.min(ttl, policy.ttlClampS) : ttl;
      const payload: ResolveResponse = {
        name,
        network: "icann",
        records,
        metadata: {
          source: "doh",
          cache: "miss"
        }
      };
      attachAuthoritySig(payload);
      if (NODE_AGGREGATOR_ENABLED) {
        const nodeResult = await verifyWithNodes(name, payload);
        if (!nodeResult.ok) {
          return res.status(502).json({ error: { code: "NODE_QUORUM_FAILED", message: nodeResult.message, retryable: true } });
        }
        payload.metadata = { ...payload.metadata, nodeQuorum: nodeResult.quorum, nodeMatches: nodeResult.matches };
      }
      cacheSet(cacheKey, effectiveTtl * 1000, payload);
      return res.json(payload);
    } catch (err: any) {
      attackCounters.gatewayErr += 1;
      const msg = String(err?.message || err);
      const code = msg === "upstream_timeout" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
      return res.status(502).json({ error: { code, message: msg, retryable: true } });
    }
  });

  app.get("/dns-query", async (req, res) => {
    try {
      const host = typeof req.headers.host === "string" ? req.headers.host : "";
      const identity = parseIdentityFromHost(host);
      if (!identity) {
        return res.status(400).json({ ok: false, error: "invalid_identity_host" });
      }
      if (!(await mintExists(identity))) {
        return res.status(400).json({ ok: false, error: "mint_not_found" });
      }
      const accept = typeof req.headers.accept === "string" ? req.headers.accept : "";
      const name = typeof req.query.name === "string" ? req.query.name : "";
      const rrtype = typeof req.query.type === "string" ? req.query.type.toUpperCase() : "A";
      if (!name) return res.status(400).json({ ok: false, error: "missing_name" });
      const cacheKey = `${identity}:${name.toLowerCase()}:${rrtype}`;
      const idCache = mintCaches.get(identity);
      const hit = idCache?.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        const answers = [{ name, type: rrtype, TTL: hit.ttl, data: hit.value }];
        if (accept.includes("application/dns-message")) {
          const response = dnsPacket.encode({
            type: "response",
            id: Math.floor(Math.random() * 65535),
            flags: dnsPacket.RECURSION_DESIRED,
            questions: [{ type: rrtype as any, name, class: "IN" }],
            answers: [{ type: rrtype as any, name, class: "IN", ttl: hit.ttl, data: hit.value }] as any
          });
          return res.set("content-type", "application/dns-message").send(Buffer.from(response));
        }
        return res.json({ Status: 0, Answer: answers });
      }
      if (name.toLowerCase().endsWith(".dns")) {
        return res.json({ Status: 3, Answer: [] });
      }
      const { records, ttl } = await resolveViaDoh(name);
      const answers = records.map((r) => ({ name, type: r.type, TTL: r.ttl ?? ttl, data: r.value }));
      if (accept.includes("application/dns-message")) {
        const response = dnsPacket.encode({
          type: "response",
          id: Math.floor(Math.random() * 65535),
          flags: dnsPacket.RECURSION_DESIRED,
          questions: [{ type: rrtype as any, name, class: "IN" }],
          answers: answers.map((a) => ({ type: a.type as any, name: a.name, class: "IN", ttl: a.TTL, data: a.data })) as any
        });
        return res.set("content-type", "application/dns-message").send(Buffer.from(response));
      }
      return res.json({ Status: 0, Answer: answers });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  app.post("/dns-query", async (req, res) => {
    try {
      const host = typeof req.headers.host === "string" ? req.headers.host : "";
      const identity = parseIdentityFromHost(host);
      if (!identity) {
        return res.status(400).json({ ok: false, error: "invalid_identity_host" });
      }
      if (!(await mintExists(identity))) {
        return res.status(400).json({ ok: false, error: "mint_not_found" });
      }
      const body = req.body instanceof Buffer ? req.body : Buffer.from(req.body);
      const decoded = dnsPacket.decode(body);
      const qname = decoded?.questions?.[0]?.name || "";
      const qtype = decoded?.questions?.[0]?.type || "A";
      const cacheKey = `${identity}:${qname.toLowerCase()}:${qtype}`;
      const idCache = mintCaches.get(identity);
      const hit = idCache?.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        const response = dnsPacket.encode({
          type: "response",
          id: decoded.id,
          flags: dnsPacket.RECURSION_DESIRED,
          questions: decoded.questions,
          answers: [{ type: qtype as any, name: qname, class: "IN", ttl: hit.ttl, data: hit.value }] as any
        });
        return res.set("content-type", "application/dns-message").send(Buffer.from(response));
      }
      if (qname.toLowerCase().endsWith(".dns")) {
        const response = dnsPacket.encode({
          type: "response",
          id: decoded.id,
          flags: dnsPacket.RECURSION_DESIRED,
          questions: decoded.questions,
          answers: []
        });
        return res.set("content-type", "application/dns-message").send(Buffer.from(response));
      }
      const responseBytes = await resolveVia(UPSTREAM_DOH_URL, body);
      return res.set("content-type", "application/dns-message").send(Buffer.from(responseBytes));
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  return app;
}

async function verifyWithNodes(name: string, authoritative: ResolveResponse): Promise<{ ok: boolean; message?: string; quorum?: number; matches?: number }> {
  const nodes = await loadNodeList();
  if (!nodes.length) return { ok: true, quorum: 0, matches: 0 };
  const responses = await Promise.all(nodes.map((node) => fetchNodeResolve(node, name)));
  const normalizedAuth = normalizeRecords(authoritative.records);
  let matches = 0;
  for (const res of responses) {
    if (!res) continue;
    const normalized = normalizeRecords(res.records || []);
    if (normalized === normalizedAuth) matches += 1;
  }
  const quorum = Math.min(NODE_QUORUM, nodes.length);
  if (matches < quorum) {
    return { ok: false, message: `quorum_failed:${matches}/${quorum}` };
  }
  return { ok: true, quorum, matches };
}

function attachAuthoritySig(payload: ResolveResponse) {
  if (!RESOLVER_PRIVATE_KEY_HEX) return;
  const resultHash = computeResultHash(payload);
  const signature = signAuthority(resultHash);
  payload.metadata = payload.metadata || {};
  payload.metadata.resultHash = resultHash;
  payload.metadata.authoritySig = signature;
  if (RESOLVER_PUBKEY_HEX) {
    payload.metadata.authorityPubKey = RESOLVER_PUBKEY_HEX;
  }
}

function computeResultHash(payload: ResolveResponse): string {
  const data = stableStringify({
    name: payload.name,
    network: payload.network,
    records: payload.records
  });
  return Buffer.from(blake3(new TextEncoder().encode(data))).toString("base64");
}

function signAuthority(resultHash: string): string {
  const msg = new TextEncoder().encode(`resolve\n${resultHash}`);
  const priv = hexToBytes(RESOLVER_PRIVATE_KEY_HEX);
  const sig = ed.sign(msg, priv);
  return bytesToHex(sig);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function bytesToHex(bytes: Uint8Array | string | Buffer): string {
  if (typeof bytes === "string") {
    return bytes;
  }
  return Buffer.from(bytes).toString("hex");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function loadNodeList(): Promise<string[]> {
  try {
    const raw = await import("node:fs").then((mod) => mod.readFileSync(NODE_LIST_PATH, "utf8"));
    const parsed = JSON.parse(raw) as { nodes?: string[] };
    return Array.isArray(parsed.nodes) ? parsed.nodes : [];
  } catch {
    return [];
  }
}

async function fetchNodeResolve(baseUrl: string, name: string): Promise<ResolveResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const url = `${normalizedBase}/wp-json/ddns/v1/resolve?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRecords(records: ResolveRecord[]): string {
  const normalized = [...records]
    .map((r) => ({ type: r.type, value: r.value, ttl: r.ttl }))
    .sort((a, b) => `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`));
  return JSON.stringify(normalized);
}

const app = createApp();

const modulePath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (modulePath === entryPath) {
  app.listen(PORT, HOST, () => {
    logInfo(`Listening on ${HOST}:${PORT}`);
  });
}

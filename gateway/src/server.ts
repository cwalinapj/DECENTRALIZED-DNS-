import express from "express";
import dnsPacket from "dns-packet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { isIP } from "node:net";
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
import { normalizeNameForHash } from "./adapters/types.js";
import { fetchArweaveSite } from "./hosting/arweave.js";
import { fetchIpfsSite } from "./hosting/ipfs.js";
import { parseHostingTarget } from "./hosting/targets.js";
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
import { createCreditsLedger } from "./lib/credits_ledger.js";
import { createRegistrarProvider, parseRegistrarProvider } from "./lib/registrar_provider.js";
import { createMockPaymentsProvider, type PaymentRail } from "@ddns/payments";

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
const IPFS_GATEWAY_BASE = process.env.IPFS_GATEWAY_BASE || IPFS_HTTP_GATEWAY_BASE_URL;
const ARWEAVE_GATEWAY_BASE = process.env.ARWEAVE_GATEWAY_BASE || "https://arweave.net";
const SITE_FETCH_TIMEOUT_MS = Number(process.env.SITE_FETCH_TIMEOUT_MS || "5000");
const SITE_MAX_BYTES = Number(process.env.SITE_MAX_BYTES || String(5 * 1024 * 1024));
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
const CREDITS_LEDGER_STORE_PATH = process.env.CREDITS_LEDGER_STORE_PATH || "gateway/.cache/credits_ledger.json";
const DOMAIN_CREDITS_ADMIN_TOKEN = process.env.DOMAIN_CREDITS_ADMIN_TOKEN || "mvp-local-admin";
const REGISTRAR_ENABLED = process.env.REGISTRAR_ENABLED === "1";
const REGISTRAR_PROVIDER = parseRegistrarProvider(process.env.REGISTRAR_PROVIDER || "mock");
const PAYMENTS_PROVIDER = process.env.PAYMENTS_PROVIDER || "mock";
const PAYMENTS_MOCK_ENABLED = process.env.PAYMENTS_MOCK_ENABLED === "1";
const PAY_QUOTE_LOCK_SECONDS = Math.max(60, Math.min(120, Number(process.env.PAY_QUOTE_LOCK_SECONDS || "120")));
const PAY_QUOTE_PRICING_PATH_ENV = process.env.PAY_QUOTE_PRICING_PATH || "";
const PORKBUN_API_KEY = process.env.PORKBUN_API_KEY || "";
const PORKBUN_SECRET_API_KEY = process.env.PORKBUN_SECRET_API_KEY || "";
const PORKBUN_ENDPOINT = process.env.PORKBUN_ENDPOINT || "https://api.porkbun.com/api/json/v3";
const REGISTRAR_DRY_RUN =
  process.env.REGISTRAR_DRY_RUN !== undefined
    ? process.env.REGISTRAR_DRY_RUN === "1"
    : REGISTRAR_ENABLED && (!PORKBUN_API_KEY || !PORKBUN_SECRET_API_KEY);
const BANNER_TEMPLATE_PATH =
  process.env.DOMAIN_BANNER_TEMPLATE_PATH || path.resolve(process.cwd(), "gateway/public/domain-continuity/banner.html");
const INTERSTITIAL_TEMPLATE_PATH =
  process.env.DOMAIN_INTERSTITIAL_TEMPLATE_PATH ||
  path.resolve(process.cwd(), "gateway/public/domain-continuity/interstitial.html");
const RATE_LIMIT_WINDOW_S = Number(process.env.RATE_LIMIT_WINDOW_S || "60");
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || "20");
const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH || "gateway/.cache/audit.log.jsonl";
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

function injectBeforeBodyEnd(html: string, fragment: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${fragment}</body>`);
  }
  return `${html}${fragment}`;
}

function renewalBannerGraceModeEnabled(req: express.Request): boolean {
  const queryFlag = typeof req.query.banner_grace_mode === "string" ? req.query.banner_grace_mode : "";
  if (queryFlag === "1" || queryFlag.toLowerCase() === "true") return true;
  return process.env.DOMAIN_BANNER_GRACE_MODE_ENABLED === "1";
}

function actorIpHash(req: express.Request): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function appendAuditLog(entry: Record<string, unknown>) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    fs.appendFileSync(AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {}
}

function auditEvent(
  req: express.Request,
  details: {
    endpoint: string;
    domain?: string;
    decision: "dry_run" | "executed" | "blocked" | "rate_limited";
    provider_ref?: string;
  }
) {
  appendAuditLog({
    timestamp: new Date().toISOString(),
    endpoint: details.endpoint,
    domain: details.domain ? normalizeDomainInput(details.domain) : null,
    decision: details.decision,
    actor: actorIpHash(req),
    provider_ref: details.provider_ref || null
  });
}

const rateLimitBuckets = new Map<string, { count: number; resetUnix: number }>();

function enforceRateLimit(req: express.Request, endpoint: string, domainRaw?: string): boolean {
  const nowUnix = Math.floor(Date.now() / 1000);
  const domain = domainRaw ? normalizeDomainInput(domainRaw) : "_";
  const key = `${endpoint}:${actorIpHash(req)}:${domain}`;
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || nowUnix >= bucket.resetUnix) {
    rateLimitBuckets.set(key, { count: 1, resetUnix: nowUnix + RATE_LIMIT_WINDOW_S });
    return false;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
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
    renewalCostEstimate?: number;
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
    credit_balance: Number(options.creditsBalance ?? 0),
    renewal_cost_estimate: Number(options.renewalCostEstimate ?? 110),
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
    hold_banner_active: policy.hold_banner_active,
    credits_balance: options.creditsBalance ?? 0,
    credits_applied_estimate: policy.credits_estimate,
    estimated_renewal_cost: Number(options.renewalCostEstimate ?? 110),
    renewal_covered_by_credits: policy.renewal_covered_by_credits,
    renewal_due_date: renewalDueDate,
    grace_expires_at: graceExpiresAt,
    policy_version: DOMAIN_CONTINUITY_POLICY_VERSION,
    auth_required: false,
    auth_mode: "stub" as const
  };
}

function addEligibilityFlags(
  status: ReturnType<typeof continuityStatus>,
  usesDdnsNs: boolean
) {
  const reasonCodes = [...status.reason_codes];
  const nextSteps = [...status.next_steps];
  if (!usesDdnsNs) {
    reasonCodes.push("MUST_USE_DDNS_NS");
    nextSteps.push("Point nameservers to TollDNS to enable continuity hold and subsidy");
  }
  const eligibleForBenefits = usesDdnsNs && status.eligible;
  return {
    ...status,
    reason_codes: [...new Set(reasonCodes)],
    next_steps: [...new Set(nextSteps)],
    credits_applied_estimate: eligibleForBenefits ? status.credits_applied_estimate : 0,
    uses_ddns_ns: usesDdnsNs,
    eligible_for_hold: eligibleForBenefits,
    eligible_for_subsidy: eligibleForBenefits
  };
}

function buildRenewalBannerState(
  status: ReturnType<typeof addEligibilityFlags>,
  ackedAt?: string | null
) {
  const nowMs = Date.now();
  const dueTs = Date.parse(status.renewal_due_date);
  const graceTs = Date.parse(status.grace_expires_at);
  const renewalDue = Number.isFinite(dueTs) ? nowMs >= dueTs : false;
  const graceSecondsRemaining = Number.isFinite(graceTs) ? Math.max(0, Math.floor((graceTs - nowMs) / 1000)) : 0;
  const bannerState = renewalDue ? "renewal_due" : "ok";
  const bannerMessage = renewalDue
    ? "Payment failed or renewal due. Renew during the grace window to avoid service interruption."
    : "Domain is active. No renewal warning is currently required.";
  const graceCountdown = renewalDue
    ? `${Math.floor(graceSecondsRemaining / 86400)}d ${Math.floor((graceSecondsRemaining % 86400) / 3600)}h`
    : "n/a";

  return {
    banner_state: bannerState,
    banner_message: bannerMessage,
    grace_seconds_remaining: graceSecondsRemaining,
    grace_countdown: graceCountdown,
    acked_at: ackedAt || null
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
    renewalCostEstimate?: number;
  } = {}
) {
  const existingRecord = await registrarAdapter.getDomain(domainRaw);
  const quote = await registrarAdapter.getRenewalQuote(domainRaw);
  const registrarNs = existingRecord.ns || [];
  const registrarNsStatus = registrarNs.some((entry) => entry.endsWith("tolldns.io"));
  const ledgerSubsidy = creditsLedger.estimateRenewalSubsidy(domainRaw);

  const status = continuityStatus(domainRaw, {
    nsStatus: options.nsStatus ?? registrarNsStatus,
    verifiedControl: options.verifiedControl,
    trafficSignal: options.trafficSignal ?? existingRecord.traffic_signal,
    renewalDueDate: options.renewalDueDate ?? existingRecord.renewal_due_date,
    lastSeenAt: options.lastSeenAt,
    abuseFlag: options.abuseFlag,
    claimRequested: options.claimRequested,
    creditsBalance: options.creditsBalance ?? ledgerSubsidy.credits_balance,
    renewalCostEstimate:
      options.renewalCostEstimate ?? Math.max(ledgerSubsidy.renewal_cost_estimate, Math.ceil(Number(quote.price_usd || 0) * 10))
  });
  return addEligibilityFlags(status, options.nsStatus ?? registrarNsStatus);
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
const creditsLedger = createCreditsLedger(CREDITS_LEDGER_STORE_PATH);
const paymentsProvider = createMockPaymentsProvider();
const PAYMENT_RAILS: PaymentRail[] = ["card", "ach", "usdc", "sol", "eth", "btc", "other"];
const PAY_QUOTE_CURRENCIES = ["USD", "USDC", "SOL", "ETH", "BTC"] as const;
type PayQuoteCurrency = (typeof PAY_QUOTE_CURRENCIES)[number];

type PayQuoteSkuConfig = {
  usd_price: number;
  pay_rails: PaymentRail[];
};

type PayQuotePricingConfig = {
  skus: Record<string, PayQuoteSkuConfig>;
};

function isAdminStubAuthorized(req: express.Request): boolean {
  const token = req.header("X-Admin-Token") || req.header("x-admin-token") || "";
  return token === DOMAIN_CREDITS_ADMIN_TOKEN;
}

function parsePaymentRail(value: unknown): PaymentRail | null {
  if (typeof value !== "string") return null;
  return PAYMENT_RAILS.includes(value as PaymentRail) ? (value as PaymentRail) : null;
}

function parsePayQuoteCurrency(value: unknown): PayQuoteCurrency | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  return PAY_QUOTE_CURRENCIES.includes(upper as PayQuoteCurrency) ? (upper as PayQuoteCurrency) : null;
}

function defaultPayQuotePricingConfig(): PayQuotePricingConfig {
  return {
    skus: {
      "renewal-basic": {
        usd_price: 12,
        pay_rails: ["card", "ach", "usdc", "sol", "eth", "btc"]
      },
      "hosting-basic": {
        usd_price: 5,
        pay_rails: ["card", "ach", "usdc", "sol", "eth", "btc"]
      }
    }
  };
}

function loadPayQuotePricingConfig(): PayQuotePricingConfig {
  const fallback = defaultPayQuotePricingConfig();
  const candidates = PAY_QUOTE_PRICING_PATH_ENV
    ? [PAY_QUOTE_PRICING_PATH_ENV]
    : [
        path.resolve(process.cwd(), "config/pay_quote_pricing.json"),
        path.resolve(process.cwd(), "../config/pay_quote_pricing.json")
      ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw) as PayQuotePricingConfig;
      if (!parsed || typeof parsed !== "object" || typeof parsed.skus !== "object") continue;
      const skus: Record<string, PayQuoteSkuConfig> = {};
      for (const [sku, cfg] of Object.entries(parsed.skus || {})) {
        const usdPrice = Number((cfg as any)?.usd_price);
        const railsRaw = Array.isArray((cfg as any)?.pay_rails) ? ((cfg as any).pay_rails as unknown[]) : [];
        const rails = railsRaw
          .map(parsePaymentRail)
          .filter((value: PaymentRail | null): value is PaymentRail => value !== null);
        if (!Number.isFinite(usdPrice) || usdPrice <= 0 || rails.length === 0) continue;
        skus[sku] = { usd_price: Number(usdPrice.toFixed(2)), pay_rails: rails };
      }
      if (Object.keys(skus).length > 0) {
        return { skus };
      }
    } catch {}
  }

  return fallback;
}

const payQuotePricing = loadPayQuotePricingConfig();

const cache = new Map<string, { expiresAt: number; payload: ResolveResponse }>();
const mintCaches = new Map<string, Map<string, { rrtype: string; value: string; ttl: number; expiresAt: number; wallet_pubkey: string }>>();
const appStartedAtMs = Date.now();

type UpstreamHealthSnapshot = {
  ok_count: number;
  error_count: number;
  last_rtt_ms: number | null;
  last_status: string | null;
  last_answers_count: number | null;
  last_seen_at: string;
};

type GatewayStatusCounters = {
  resolve_requests: number;
  resolve_icann_requests: number;
  resolve_dns_requests: number;
  cache_hits: number;
  cache_misses: number;
  stale_served: number;
};

const gatewayStatusCounters: GatewayStatusCounters = {
  resolve_requests: 0,
  resolve_icann_requests: 0,
  resolve_dns_requests: 0,
  cache_hits: 0,
  cache_misses: 0,
  stale_served: 0
};

const recursiveUpstreamHealth = new Map<string, UpstreamHealthSnapshot>();

function noteResolveCounters(source?: string) {
  gatewayStatusCounters.resolve_requests += 1;
  gatewayStatusCounters.resolve_icann_requests += 1;
  if (source === "cache") gatewayStatusCounters.cache_hits += 1;
  if (source === "upstream") gatewayStatusCounters.cache_misses += 1;
  if (source === "stale") gatewayStatusCounters.stale_served += 1;
}

function noteUpstreamHealth(upstreams: Array<{ url?: string; rttMs?: number; rtt_ms?: number; status?: string; answersCount?: number; answers_count?: number }>) {
  const nowIso = new Date().toISOString();
  for (const upstream of upstreams) {
    const url = String(upstream?.url || "").trim();
    if (!url) continue;
    const prev = recursiveUpstreamHealth.get(url) || {
      ok_count: 0,
      error_count: 0,
      last_rtt_ms: null,
      last_status: null,
      last_answers_count: null,
      last_seen_at: nowIso
    };

    const status = String(upstream?.status || "UNKNOWN").toUpperCase();
    if (status === "NOERROR" || status === "OK") {
      prev.ok_count += 1;
    } else {
      prev.error_count += 1;
    }
    const rttMs = Number(upstream?.rttMs ?? upstream?.rtt_ms);
    const answersCount = Number(upstream?.answersCount ?? upstream?.answers_count);
    prev.last_rtt_ms = Number.isFinite(rttMs) ? rttMs : null;
    prev.last_answers_count = Number.isFinite(answersCount) ? answersCount : null;
    prev.last_status = status;
    prev.last_seen_at = nowIso;
    recursiveUpstreamHealth.set(url, prev);
  }
}

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

type DnsTimingMetric = { name: string; durMs: number; desc?: string };

function normalizeDnsQtype(value: unknown): "A" | "AAAA" | null {
  if (typeof value === "number") {
    if (value === 1) return "A";
    if (value === 28) return "AAAA";
    return null;
  }
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper === "A" || upper === "AAAA") return upper;
  }
  return null;
}

function decodeBase64UrlToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function encodeDnsWireResponse(
  id: number,
  questions: Array<{ type: any; name: string; class?: any }>,
  rcode: number,
  answers: Array<{ type: "A" | "AAAA"; name: string; class: "IN"; ttl: number; data: string }>
) {
  return dnsPacket.encode({
    type: "response",
    id,
    flags: dnsPacket.RECURSION_DESIRED | dnsPacket.RECURSION_AVAILABLE | (rcode & 0x0f),
    questions,
    answers
  });
}

function serverTimingHeader(metrics: DnsTimingMetric[]): string {
  const entries: string[] = [];
  for (const metric of metrics) {
    if (!Number.isFinite(metric.durMs) || metric.durMs < 0) continue;
    const dur = Number(metric.durMs.toFixed(2));
    const desc = metric.desc ? `;desc="${metric.desc.replace(/"/g, "'")}"` : "";
    entries.push(`${metric.name};dur=${dur}${desc}`);
  }
  return entries.join(", ");
}

export function createApp(overrides?: { adapterRegistry?: { resolveAuto: typeof adapterRegistry.resolveAuto } }) {
  const app = express();
  const activeAdapterRegistry = overrides?.adapterRegistry || adapterRegistry;

  app.use("/dns-query", express.raw({ type: ["application/dns-message"], limit: "512kb" }));

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.get("/v1/status", (_req, res) => {
    const cacheTotal = gatewayStatusCounters.cache_hits + gatewayStatusCounters.cache_misses;
    const hitRate = cacheTotal > 0 ? Number((gatewayStatusCounters.cache_hits / cacheTotal).toFixed(4)) : null;
    const upstreams = Array.from(recursiveUpstreamHealth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([url, snapshot]) => ({
        url,
        ...snapshot
      }));

    return res.json({
      ok: true,
      service: "gateway",
      now_utc: new Date().toISOString(),
      uptime_s: Math.max(0, Math.floor((Date.now() - appStartedAtMs) / 1000)),
      recursive_upstreams: upstreams,
      cache: {
        entries_in_memory: cache.size,
        hits: gatewayStatusCounters.cache_hits,
        misses: gatewayStatusCounters.cache_misses,
        stale_served: gatewayStatusCounters.stale_served,
        hit_rate: hitRate
      },
      resolve: {
        total_requests: gatewayStatusCounters.resolve_requests,
        icann_requests: gatewayStatusCounters.resolve_icann_requests,
        dns_requests: gatewayStatusCounters.resolve_dns_requests
      },
      attack_mode: {
        endpoint: "/v1/attack-mode",
        enabled: ATTACK_MODE_ENABLED,
        mode: attackMode,
        decision: attackDecision,
        window: {
          secs: ATTACK_WINDOW_SECS,
          totalReq: attackCounters.totalReq,
          gatewayErr: attackCounters.gatewayErr,
          rpcTotal: attackCounters.rpcTotal,
          rpcErr: attackCounters.rpcErr
        }
      }
    });
  });

  app.get("/v1/pay/quote", async (req, res) => {
    const sku = typeof req.query.sku === "string" ? req.query.sku.trim() : "";
    const currency = parsePayQuoteCurrency(req.query.currency || "USD");
    if (!sku) return res.status(400).json({ error: "missing_sku" });
    if (!currency) return res.status(400).json({ error: "invalid_currency" });
    const config = payQuotePricing.skus[sku];
    if (!config) return res.status(404).json({ error: "sku_not_found" });

    return res.json({
      sku,
      currency,
      usd_price: Number(config.usd_price.toFixed(2)),
      quote_id: `quote_${crypto.randomUUID()}`,
      expires_at: new Date(Date.now() + PAY_QUOTE_LOCK_SECONDS * 1000).toISOString(),
      pay_rails: config.pay_rails,
      disclaimer: "Quote expires; refresh on expiry"
    });
  });

  app.post("/v1/payments/quote", express.json(), async (req, res) => {
    if (!PAYMENTS_MOCK_ENABLED || PAYMENTS_PROVIDER !== "mock") {
      return res.status(404).json({ error: "payments_disabled" });
    }
    const sku = typeof req.body?.sku === "string" ? req.body.sku.trim() : "";
    const amountCents = Number(req.body?.money?.amountCents);
    const currency = req.body?.money?.currency;
    const customerHint = typeof req.body?.customerHint === "string" ? req.body.customerHint : undefined;
    const railsInput = Array.isArray(req.body?.rails) ? (req.body.rails as unknown[]) : [];
    const rails = railsInput
      .map(parsePaymentRail)
      .filter((value: PaymentRail | null): value is PaymentRail => value !== null);
    if (!sku) return res.status(400).json({ error: "missing_sku" });
    if (!Number.isFinite(amountCents) || amountCents <= 0) return res.status(400).json({ error: "invalid_amount" });
    if (currency !== "USD") return res.status(400).json({ error: "unsupported_currency" });
    if (rails.length === 0) return res.status(400).json({ error: "invalid_rails" });
    try {
      const quote = await paymentsProvider.createQuote({
        sku,
        money: { amountCents, currency: "USD" },
        rails,
        customerHint
      });
      return res.json({
        provider: "mock",
        ...quote
      });
    } catch (err: any) {
      return res.status(400).json({ error: String(err?.message || "quote_failed") });
    }
  });

  app.post("/v1/payments/checkout", express.json(), async (req, res) => {
    if (!PAYMENTS_MOCK_ENABLED || PAYMENTS_PROVIDER !== "mock") {
      return res.status(404).json({ error: "payments_disabled" });
    }
    const quoteId = typeof req.body?.quoteId === "string" ? req.body.quoteId : "";
    const rail = parsePaymentRail(req.body?.rail);
    const returnUrl = typeof req.body?.returnUrl === "string" ? req.body.returnUrl : "";
    if (!quoteId) return res.status(400).json({ error: "missing_quote_id" });
    if (!rail) return res.status(400).json({ error: "invalid_rail" });
    if (!returnUrl) return res.status(400).json({ error: "missing_return_url" });
    try {
      const checkout = await paymentsProvider.createCheckout({ quoteId, rail, returnUrl });
      return res.json({
        provider: "mock",
        ...checkout
      });
    } catch (err: any) {
      return res.status(400).json({ error: String(err?.message || "checkout_failed") });
    }
  });

  app.get("/v1/payments/status", async (req, res) => {
    if (!PAYMENTS_MOCK_ENABLED || PAYMENTS_PROVIDER !== "mock") {
      return res.status(404).json({ error: "payments_disabled" });
    }
    const id = typeof req.query.id === "string" ? req.query.id : "";
    if (!id) return res.status(400).json({ error: "missing_id" });
    const status = await paymentsProvider.getStatus(id);
    return res.json({ id, status, provider: "mock" });
  });

  app.post("/mock-pay/mark-paid", async (req, res) => {
    if (!PAYMENTS_MOCK_ENABLED || PAYMENTS_PROVIDER !== "mock") {
      return res.status(404).json({ error: "payments_disabled" });
    }
    const id = typeof req.query.id === "string" ? req.query.id : "";
    if (!id) return res.status(400).json({ error: "missing_id" });
    const marked = paymentsProvider.markPaid(id);
    if (!marked) return res.status(404).json({ error: "checkout_not_found_or_expired" });
    const status = await paymentsProvider.getStatus(id);
    return res.json({ id, status, provider: "mock" });
  });

  app.get("/v1/registrar/domain", async (req, res) => {
    try {
      const domain = typeof req.query.domain === "string" ? req.query.domain : "";
      if (!domain) return res.status(400).json({ error: "missing_domain" });
      if (enforceRateLimit(req, "registrar_domain", domain)) {
        auditEvent(req, { endpoint: "/v1/registrar/domain", domain, decision: "rate_limited" });
        return res.status(429).json({ error: "rate_limited" });
      }
      const record = await registrarAdapter.getDomain(domain);
      auditEvent(req, {
        endpoint: "/v1/registrar/domain",
        domain,
        decision: registrarRuntime.dryRun ? "dry_run" : "executed"
      });
      return res.json({
        ...record,
        registrar_enabled: registrarRuntime.enabled,
        provider: registrarRuntime.provider,
        dry_run: registrarRuntime.dryRun
      });
    } catch (err: any) {
      const domain = typeof req.query.domain === "string" ? req.query.domain : "";
      auditEvent(req, { endpoint: "/v1/registrar/domain", domain, decision: "blocked" });
      return res.status(502).json({ error: "registrar_provider_error", message: String(err?.message || "unknown_error") });
    }
  });

  app.get("/v1/registrar/quote", async (req, res) => {
    try {
      const domain = typeof req.query.domain === "string" ? req.query.domain : "";
      if (!domain) return res.status(400).json({ error: "missing_domain" });
      if (enforceRateLimit(req, "registrar_quote", domain)) {
        auditEvent(req, { endpoint: "/v1/registrar/quote", domain, decision: "rate_limited" });
        return res.status(429).json({ error: "rate_limited" });
      }
      const quote = await registrarAdapter.getRenewalQuote(domain);
      auditEvent(req, {
        endpoint: "/v1/registrar/quote",
        domain,
        decision: registrarRuntime.dryRun ? "dry_run" : "executed"
      });
      return res.json({
        domain: normalizeDomainInput(domain),
        ...quote,
        registrar_enabled: registrarRuntime.enabled,
        provider: registrarRuntime.provider,
        dry_run: registrarRuntime.dryRun
      });
    } catch (err: any) {
      const domain = typeof req.query.domain === "string" ? req.query.domain : "";
      auditEvent(req, { endpoint: "/v1/registrar/quote", domain, decision: "blocked" });
      return res.status(502).json({ error: "registrar_provider_error", message: String(err?.message || "unknown_error") });
    }
  });

  app.post("/v1/registrar/renew", express.json(), async (req, res) => {
    try {
      const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
      if (!domain) return res.status(400).json({ error: "missing_domain" });
      if (enforceRateLimit(req, "registrar_renew", domain)) {
        auditEvent(req, { endpoint: "/v1/registrar/renew", domain, decision: "rate_limited" });
        return res.status(429).json({ error: "rate_limited" });
      }
      const years = Math.max(1, Number(req.body?.years || 1));
      const [quote, domainInfo] = await Promise.all([
        registrarAdapter.getRenewalQuote(domain),
        registrarAdapter.getDomain(domain)
      ]);
      const credits = Number(domainInfo.credits_balance || 0);
      const requiredUsd = Number((Number(quote.price_usd || 0) * years).toFixed(2));
      const requiredCredits = Math.ceil(requiredUsd * 10);
      const coveredCredits = Math.min(requiredCredits, credits);
      if (requiredCredits > coveredCredits) {
        auditEvent(req, { endpoint: "/v1/registrar/renew", domain, decision: "blocked" });
        return res.json({
          domain: normalizeDomainInput(domain),
          years,
          status: "insufficient_credits",
          required_usd: requiredUsd,
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
      auditEvent(req, {
        endpoint: "/v1/registrar/renew",
        domain,
        decision: registrarRuntime.dryRun ? "dry_run" : "executed",
        provider_ref: result.provider_ref
      });
      return res.json({
        domain: normalizeDomainInput(domain),
        years,
        ...result,
        status: result.submitted ? "submitted" : "failed",
        required_usd: requiredUsd,
        covered_usd: Number((coveredCredits / 10).toFixed(2)),
        remaining_usd: 0,
        registrar_enabled: registrarRuntime.enabled,
        provider: registrarRuntime.provider,
        dry_run: registrarRuntime.dryRun
      });
    } catch (err: any) {
      const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
      auditEvent(req, { endpoint: "/v1/registrar/renew", domain, decision: "blocked" });
      return res.status(502).json({ error: "registrar_provider_error", message: String(err?.message || "unknown_error") });
    }
  });

  app.post("/v1/registrar/ns", express.json(), async (req, res) => {
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    const ns = Array.isArray(req.body?.ns) ? req.body.ns : [];
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    if (enforceRateLimit(req, "registrar_ns", domain)) {
      auditEvent(req, { endpoint: "/v1/registrar/ns", domain, decision: "rate_limited" });
      return res.status(429).json({ error: "rate_limited" });
    }
    const result = await registrarAdapter.setNameServers(domain, ns);
    auditEvent(req, {
      endpoint: "/v1/registrar/ns",
      domain,
      decision: registrarRuntime.dryRun ? "dry_run" : "executed",
      provider_ref: result.provider_ref
    });
    return res.json({
      domain: normalizeDomainInput(domain),
      ns,
      ...result,
      registrar_enabled: registrarRuntime.enabled,
      provider: registrarRuntime.provider,
      dry_run: registrarRuntime.dryRun
    });
  });

  app.get("/v1/credits/balance", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const subsidy = creditsLedger.estimateRenewalSubsidy(domain);
    return res.json({
      domain: normalizeDomainInput(domain),
      credits_balance: subsidy.credits_balance,
      renewal_cost_estimate: subsidy.renewal_cost_estimate,
      covered_amount: subsidy.covered_amount,
      renewal_covered_by_credits: subsidy.covered_by_credits,
      auth_required: false,
      auth_mode: "stub"
    });
  });

  app.post("/v1/credits/credit", express.json(), async (req, res) => {
    if (!isAdminStubAuthorized(req)) return res.status(403).json({ error: "admin_token_required" });
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    const amount = Number(req.body?.amount || 0);
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "manual_credit";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    try {
      const balance = creditsLedger.credit(domain, amount, reason);
      return res.json({ domain: normalizeDomainInput(domain), credits_balance: balance, reason, accepted: true });
    } catch (err: any) {
      return res.status(400).json({ error: String(err?.message || err) });
    }
  });

  app.post("/v1/credits/debit", express.json(), async (req, res) => {
    if (!isAdminStubAuthorized(req)) return res.status(403).json({ error: "admin_token_required" });
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    const amount = Number(req.body?.amount || 0);
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "manual_debit";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    try {
      const balance = creditsLedger.debit(domain, amount, reason);
      return res.json({ domain: normalizeDomainInput(domain), credits_balance: balance, reason, accepted: true });
    } catch (err: any) {
      return res.status(400).json({ error: String(err?.message || err) });
    }
  });

  app.get("/v1/domain/status", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    if (enforceRateLimit(req, "domain_status", domain)) {
      auditEvent(req, { endpoint: "/v1/domain/status", domain, decision: "rate_limited" });
      return res.status(429).json({ error: "rate_limited" });
    }
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
      creditsBalance: creditsLedger.getBalance(domain)
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
        credit_balance: creditsLedger.getBalance(domain),
        renewal_cost_estimate: status.estimated_renewal_cost,
        renewal_due_date: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || status.renewal_due_date,
        last_seen_at: new Date().toISOString(),
        abuse_flag: existing?.inputs?.abuse_flag ?? false
      },
      last_updated_at: new Date().toISOString()
    }));
    auditEvent(req, { endpoint: "/v1/domain/status", domain, decision: "executed" });
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
    if (enforceRateLimit(req, "domain_renew", domain)) {
      auditEvent(req, { endpoint: "/v1/domain/renew", domain, decision: "rate_limited" });
      return res.status(429).json({ error: "rate_limited" });
    }
    const useCredits = req.body?.use_credits !== false;
    const years = Number(req.body?.years || 1);
    const subsidyBefore = creditsLedger.estimateRenewalSubsidy(domain);
    const creditsToApply = useCredits ? subsidyBefore.covered_amount : 0;
    const renewal = await registrarAdapter.renewDomain(domain, years, {
      use_credits: useCredits,
      credits_amount: creditsToApply,
      payment_method: useCredits ? "credits" : "stub"
    });
    let creditsApplied = 0;
    let creditsDebitError: string | null = null;
    if (renewal.submitted && creditsToApply > 0) {
      try {
        creditsLedger.debit(domain, creditsToApply, "renewal_subsidy");
        creditsApplied = creditsToApply;
      } catch (err) {
        creditsDebitError = err instanceof Error ? err.message : "credits_debit_failed";
      }
    }
    const existing = domainStatusStore.get(domain);
    const registrarDomain = await registrarAdapter.getDomain(domain);
    const subsidyAfter = creditsLedger.estimateRenewalSubsidy(domain);
    const status = await continuityStatusFromSources(domain, {
      nsStatus: existing?.inputs?.ns_status ?? registrarDomain.ns.some((entry) => entry.endsWith("tolldns.io")),
      verifiedControl: existing?.inputs?.verified_control ?? false,
      trafficSignal: existing?.inputs?.traffic_signal ?? registrarDomain.traffic_signal ?? "none",
      renewalDueDate: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || undefined,
      lastSeenAt: existing?.inputs?.last_seen_at || undefined,
      abuseFlag: existing?.inputs?.abuse_flag ?? false,
      claimRequested: existing?.claim_requested ?? false,
      creditsBalance: subsidyAfter.credits_balance,
      renewalCostEstimate: subsidyAfter.renewal_cost_estimate
    });
    domainStatusStore.upsert(domain, (current) => ({
      domain: normalizeDomainInput(domain),
      ...current,
      status,
      last_updated_at: new Date().toISOString()
    }));
    auditEvent(req, {
      endpoint: "/v1/domain/renew",
      domain,
      decision: renewal.submitted ? (registrarRuntime.dryRun ? "dry_run" : "executed") : "blocked",
      provider_ref: renewal.provider_ref
    });
    if (creditsDebitError) {
      auditEvent(req, {
        endpoint: "/v1/domain/renew",
        domain,
        decision: "blocked"
      });
    }
    return res.json({
      domain: status.domain,
      accepted: renewal.submitted,
      message: renewal.submitted ? "submitted_to_mock_registrar" : "stubbed: pending integration",
      reason_codes: creditsDebitError ? [...renewal.errors, "credits_debit_failed"] : renewal.errors,
      credits_applied_estimate: renewal.submitted ? creditsApplied : 0,
      credits_balance: subsidyAfter.credits_balance,
      renewal_covered_by_credits: status.renewal_covered_by_credits,
      renewal_due_date: status.renewal_due_date,
      grace_expires_at: status.grace_expires_at,
      auth_required: false,
      auth_mode: "stub",
      policy_version: DOMAIN_CONTINUITY_POLICY_VERSION,
      notice_signature: "mvp-local-policy"
    });
  });

  app.get("/v1/domain/continuity", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    if (enforceRateLimit(req, "domain_continuity", domain)) {
      auditEvent(req, { endpoint: "/v1/domain/continuity", domain, decision: "rate_limited" });
      return res.status(429).json({ error: "rate_limited" });
    }
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
    auditEvent(req, { endpoint: "/v1/domain/continuity", domain, decision: "executed" });
    return res.json({
      ...status,
      registrar_status: registrarDomain.status
    });
  });

  app.post("/v1/domain/continuity/claim", express.json(), async (req, res) => {
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    if (enforceRateLimit(req, "domain_continuity_claim", domain)) {
      auditEvent(req, { endpoint: "/v1/domain/continuity/claim", domain, decision: "rate_limited" });
      return res.status(429).json({ error: "rate_limited" });
    }
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
      creditsBalance: creditsLedger.getBalance(domain)
    });
    domainStatusStore.upsert(domain, (current) => ({
      domain: normalizeDomainInput(domain),
      ...current,
      claim_requested: true,
      claim_requested_at: new Date().toISOString(),
      status,
      last_updated_at: new Date().toISOString()
    }));
    auditEvent(req, {
      endpoint: "/v1/domain/continuity/claim",
      domain,
      decision: status.eligible ? "executed" : "blocked"
    });
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

  app.get("/v1/domain/continuity", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    const existing = domainStatusStore.get(domain);
    const registrarDomain = await registrarAdapter.getDomain(domain);
    const registrarQuote = await registrarAdapter.getRenewalQuote(domain);
    const subsidy = creditsLedger.estimateRenewalSubsidy(domain);
    const status = await continuityStatusFromSources(domain, {
      nsStatus: existing?.inputs?.ns_status ?? registrarDomain.ns.some((entry) => entry.endsWith("tolldns.io")),
      verifiedControl: existing?.inputs?.verified_control ?? false,
      trafficSignal: existing?.inputs?.traffic_signal ?? registrarDomain.traffic_signal ?? "none",
      renewalDueDate: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || undefined,
      lastSeenAt: existing?.inputs?.last_seen_at || undefined,
      abuseFlag: existing?.inputs?.abuse_flag ?? false,
      claimRequested: existing?.claim_requested ?? false,
      creditsBalance: subsidy.credits_balance,
      renewalCostEstimate: Math.max(subsidy.renewal_cost_estimate, Math.ceil(Number(registrarQuote.price_usd || 0) * 10))
    });
    return res.json({
      domain: status.domain,
      continuity: status,
      registrar: {
        status: registrarDomain.status,
        renewal_due_date: registrarDomain.renewal_due_date || status.renewal_due_date,
        grace_expires_at: registrarDomain.grace_expires_at || status.grace_expires_at,
        ns: registrarDomain.ns
      },
      credits: subsidy,
      auth_required: false,
      auth_mode: "stub",
      policy_version: DOMAIN_CONTINUITY_POLICY_VERSION
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
      creditsBalance: creditsLedger.getBalance(domain)
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

  app.post("/v1/domain/banner/ack", express.json(), async (req, res) => {
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    if (!domain) return res.status(400).json({ error: "missing_domain" });
    if (enforceRateLimit(req, "/v1/domain/banner/ack", domain)) {
      auditEvent(req, { endpoint: "/v1/domain/banner/ack", domain, decision: "rate_limited" });
      return res.status(429).json({ error: "rate_limited" });
    }

    const ackedAt = new Date().toISOString();
    domainStatusStore.upsert(domain, (current) => ({
      domain: normalizeDomainInput(domain),
      ...current,
      banner_ack_at: ackedAt,
      last_updated_at: ackedAt
    }));
    auditEvent(req, { endpoint: "/v1/domain/banner/ack", domain, decision: "executed" });
    return res.json({ ok: true, domain: normalizeDomainInput(domain), acked_at: ackedAt });
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
      creditsBalance: creditsLedger.getBalance(domain)
    });
    const bannerState = buildRenewalBannerState(status, existing?.banner_ack_at);

    if (typeof req.query.format === "string" && req.query.format.toLowerCase() === "json") {
      return res.json({
        domain: status.domain,
        phase: status.phase,
        renewal_due_date: status.renewal_due_date,
        grace_expires_at: status.grace_expires_at,
        ...bannerState
      });
    }

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
      "<!doctype html><html><body><h1>{{domain}}</h1><p>{{phase}}</p><p>{{banner_message}}</p><p>{{grace_countdown}}</p><a href=\"{{renew_url}}\">Renew now</a><pre>{{token}}</pre><code>{{verify_url}}</code></body></html>";
    const template = useInterstitial
      ? readTemplate(INTERSTITIAL_TEMPLATE_PATH, fallbackTemplate)
      : readTemplate(BANNER_TEMPLATE_PATH, fallbackTemplate);
    const html = renderHtmlTemplate(template, {
      domain: status.domain,
      phase: status.phase,
      renew_url: renewUrl,
      dashboard_url: dashboardUrl,
      token,
      verify_url: verifyUrl,
      banner_message: bannerState.banner_message,
      grace_countdown: bannerState.grace_countdown
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
      const ans = await activeAdapterRegistry.resolveAuto({
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

  app.get("/v1/site", async (req, res) => {
    try {
      const name = typeof req.query.name === "string" ? req.query.name : "";
      const sitePath = typeof req.query.path === "string" ? req.query.path : "/";
      if (!name) return res.status(400).json({ error: "missing_name" });
      const graceModeBannerEnabled = renewalBannerGraceModeEnabled(req);

      const ans = await activeAdapterRegistry.resolveAuto({
        name,
        nowUnix: Math.floor(Date.now() / 1000),
        network: "gateway",
        opts: { timeoutMs: REQUEST_TIMEOUT_MS }
      });

      const target = ans.dest ? parseHostingTarget(ans.dest) : null;
      if (!target) {
        return res.status(400).json({ error: "not_hosting_target", dest: ans.dest });
      }

      const fetched =
        target.scheme === "ipfs"
          ? await fetchIpfsSite({
            cid: target.value,
            path: sitePath,
            gatewayBase: IPFS_GATEWAY_BASE,
            timeoutMs: SITE_FETCH_TIMEOUT_MS,
            maxBytes: SITE_MAX_BYTES
          })
          : await fetchArweaveSite({
            tx: target.value,
            path: sitePath,
            gatewayBase: ARWEAVE_GATEWAY_BASE,
            timeoutMs: SITE_FETCH_TIMEOUT_MS,
            maxBytes: SITE_MAX_BYTES
          });

      let body = fetched.body;
      if (graceModeBannerEnabled && String(fetched.contentType || "").toLowerCase().includes("text/html")) {
        const existing = domainStatusStore.get(name);
        const registrarDomain = await registrarAdapter.getDomain(name);
        const status = await continuityStatusFromSources(name, {
          nsStatus: existing?.inputs?.ns_status ?? registrarDomain.ns.some((entry) => entry.endsWith("tolldns.io")),
          verifiedControl: existing?.inputs?.verified_control ?? false,
          trafficSignal: existing?.inputs?.traffic_signal ?? registrarDomain.traffic_signal ?? "none",
          renewalDueDate: existing?.inputs?.renewal_due_date || registrarDomain.renewal_due_date || undefined,
          lastSeenAt: existing?.inputs?.last_seen_at || undefined,
          abuseFlag: existing?.inputs?.abuse_flag ?? false,
          claimRequested: existing?.claim_requested ?? false,
          creditsBalance: creditsLedger.getBalance(name)
        });
        const bannerState = buildRenewalBannerState(status, existing?.banner_ack_at);
        if (bannerState.banner_state === "renewal_due") {
          const baseUrl = `${req.protocol}://${req.get("host") || "127.0.0.1:8054"}`;
          const paymentUrl = `${baseUrl}/domain-continuity/index.html?domain=${encodeURIComponent(status.domain)}`;
          const overlay = `<aside style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#111827;color:#f9fafb;padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 -2px 8px rgba(0,0,0,.35)"><strong>Renewal grace mode:</strong> ${escapeHtml(status.domain)} ${escapeHtml(bannerState.grace_countdown)} remaining. <a href="${escapeHtml(paymentUrl)}" style="color:#93c5fd;text-decoration:underline">Complete payment</a></aside>`;
          body = Buffer.from(injectBeforeBodyEnd(fetched.body.toString("utf8"), overlay), "utf8");
          res.setHeader("X-DDNS-Renewal-Banner", "grace_mode");
        }
      }

      if (fetched.contentType) {
        res.setHeader("Content-Type", fetched.contentType);
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'"
      );
      res.setHeader("X-DDNS-Hosting-Source", fetched.sourceUrl);
      return res.status(200).send(body);
    } catch (err: any) {
      const status = Number(err?.statusCode || 500);
      if (status >= 400 && status <= 599) {
        return res.status(status).json({ error: String(err?.message || err) });
      }
      return res.status(500).json({ error: String(err?.message || err) });
    }
  });

  app.get("/v1/resolve", async (req, res) => {
    try {
      const name = typeof req.query.name === "string" ? req.query.name : "";
      const type = typeof req.query.type === "string" ? req.query.type.toUpperCase() : "A";
      if (!name) return res.status(400).json({ error: "missing_name" });

      if (name.toLowerCase().endsWith(".dns")) {
        const ans = await activeAdapterRegistry.resolveAuto({
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
        gatewayStatusCounters.resolve_requests += 1;
        gatewayStatusCounters.resolve_dns_requests += 1;
        return res.json(ans);
      }

      const out = await recursiveAdapter.resolveRecursive(name, type);
      noteResolveCounters(out.source);
      noteUpstreamHealth(
        Array.isArray(out.upstreamsUsed)
          ? (out.upstreamsUsed as Array<{ url?: string; rttMs?: number; status?: string; answersCount?: number }>)
          : []
      );
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

  async function resolveDohAnswers(qnameInput: string, qtype: "A" | "AAAA") {
    const startedAtMs = Date.now();
    const timing: DnsTimingMetric[] = [];
    const qname = normalizeNameForHash(qnameInput);
    if (qname.endsWith(".dns")) {
      gatewayStatusCounters.resolve_requests += 1;
      gatewayStatusCounters.resolve_dns_requests += 1;
      try {
        const route = await activeAdapterRegistry.resolveAuto({
          name: qname,
          nowUnix: Math.floor(Date.now() / 1000),
          network: "gateway",
          opts: {
            timeoutMs: REQUEST_TIMEOUT_MS,
            qtype
          }
        });
        const dest = String(route?.dest || "");
        const ipKind = isIP(dest);
        if ((qtype === "A" && ipKind === 4) || (qtype === "AAAA" && ipKind === 6)) {
          timing.push({ name: "pkdns", durMs: Date.now() - startedAtMs, desc: "onchain" });
          return {
            rcode: 0,
            answers: [{ type: qtype, name: qname, class: "IN" as const, ttl: Number(route.ttlS || 60), data: dest }],
            timing
          };
        }
        timing.push({ name: "pkdns", durMs: Date.now() - startedAtMs, desc: "onchain" });
        return { rcode: 3, answers: [], timing };
      } catch {
        timing.push({ name: "pkdns", durMs: Date.now() - startedAtMs, desc: "error" });
        return { rcode: 2, answers: [], timing };
      }
    }

    const out = await recursiveAdapter.resolveRecursive(qname, qtype);
    const upstreams = Array.isArray(out.upstreamsUsed)
      ? (out.upstreamsUsed as Array<{ url?: string; rttMs?: number; rtt_ms?: number; status?: string; answersCount?: number }>)
      : [];
    for (let i = 0; i < upstreams.length; i += 1) {
      const upstream = upstreams[i];
      const rawUrl = String(upstream?.url || "");
      const host = rawUrl ? (() => {
        try {
          return new URL(rawUrl).host;
        } catch {
          return rawUrl;
        }
      })() : `upstream-${i}`;
      const dur = Number(upstream?.rttMs ?? upstream?.rtt_ms ?? 0);
      timing.push({ name: `up${i}`, durMs: Number.isFinite(dur) ? dur : 0, desc: host });
    }
    noteResolveCounters(out.source);
    noteUpstreamHealth(upstreams);
    if (out.status === "NXDOMAIN") {
      return { rcode: 3, answers: [], timing };
    }
    const answers = out.answers
      .filter((answer) => answer.type === qtype && ((qtype === "A" && isIP(answer.data) === 4) || (qtype === "AAAA" && isIP(answer.data) === 6)))
      .map((answer) => ({
        type: qtype,
        name: answer.name,
        class: "IN" as const,
        ttl: Math.max(1, Math.min(Number(answer.ttl || out.ttlS || 60), Number(out.ttlS || 60))),
        data: answer.data
      }));
    return { rcode: answers.length ? 0 : 3, answers, timing };
  }

  async function handleDohWireQuery(queryBuffer: Buffer) {
    const startedAtMs = Date.now();
    const decoded = dnsPacket.decode(queryBuffer) as any;
    const question = Array.isArray(decoded?.questions) ? decoded.questions[0] : null;
    const qname = question?.name ? String(question.name) : "";
    const qtype = normalizeDnsQtype(question?.type);
    const id = Number(decoded?.id || 0);
    const questions = Array.isArray(decoded?.questions) ? decoded.questions : [];

    if (!qname || !qtype) {
      const response = encodeDnsWireResponse(id, questions, 4, []);
      return {
        wire: Buffer.from(response),
        rcode: 4,
        answers: [],
        ttlS: 0,
        cacheControl: "no-store",
        serverTiming: serverTimingHeader([{ name: "total", durMs: Date.now() - startedAtMs }])
      };
    }

    try {
      const resolved = await resolveDohAnswers(qname, qtype);
      const response = encodeDnsWireResponse(id, questions, resolved.rcode, resolved.answers);
      const ttlS = resolved.answers.length > 0
        ? Math.max(1, Math.min(...resolved.answers.map((answer) => Math.max(1, Number(answer.ttl || 60)))))
        : 0;
      const metrics = [...resolved.timing, { name: "total", durMs: Date.now() - startedAtMs }];
      return {
        wire: Buffer.from(response),
        rcode: resolved.rcode,
        answers: resolved.answers,
        ttlS,
        cacheControl: resolved.rcode === 0 && ttlS > 0 ? `public, max-age=${ttlS}` : "no-store",
        serverTiming: serverTimingHeader(metrics)
      };
    } catch {
      const response = encodeDnsWireResponse(id, questions, 2, []);
      return {
        wire: Buffer.from(response),
        rcode: 2,
        answers: [],
        ttlS: 0,
        cacheControl: "no-store",
        serverTiming: serverTimingHeader([{ name: "total", durMs: Date.now() - startedAtMs }])
      };
    }
  }

  app.get("/dns-query", async (req, res) => {
    try {
      const accept = typeof req.headers.accept === "string" ? req.headers.accept : "";
      const dnsParam = typeof req.query.dns === "string" ? req.query.dns : "";

      let wireQuery: Buffer | null = null;
      if (dnsParam) {
        wireQuery = decodeBase64UrlToBuffer(dnsParam);
      } else {
        const name = typeof req.query.name === "string" ? req.query.name : "";
        const qtype = typeof req.query.type === "string" ? req.query.type.toUpperCase() : "A";
        const normalizedQtype = normalizeDnsQtype(qtype);
        if (!name || !normalizedQtype) {
          return res.status(400).json({ error: "missing_or_invalid_query" });
        }
        wireQuery = Buffer.from(dnsPacket.encode({
          type: "query",
          id: Math.floor(Math.random() * 65535),
          flags: dnsPacket.RECURSION_DESIRED,
          questions: [{ type: normalizedQtype, name, class: "IN" }]
        }));
      }

      const out = await handleDohWireQuery(wireQuery);
      if (!dnsParam && !accept.includes("application/dns-message")) {
        return res.json({
          Status: out.rcode,
          Answer: out.answers.map((answer) => ({
            name: answer.name,
            type: answer.type,
            TTL: answer.ttl,
            data: answer.data
          }))
        });
      }

      return res
        .set("content-type", "application/dns-message")
        .set("cache-control", out.cacheControl)
        .set("server-timing", out.serverTiming || "")
        .status(200)
        .send(out.wire);
    } catch (err: any) {
      return res.status(400).json({ error: String(err?.message || "invalid_dns_query") });
    }
  });

  app.post("/dns-query", async (req, res) => {
    try {
      const body = req.body instanceof Buffer ? req.body : Buffer.from(req.body || []);
      if (!body.length) return res.status(400).json({ error: "empty_dns_query" });
      const out = await handleDohWireQuery(body);
      return res
        .set("content-type", "application/dns-message")
        .set("cache-control", out.cacheControl)
        .set("server-timing", out.serverTiming || "")
        .status(200)
        .send(out.wire);
    } catch (err: any) {
      return res.status(400).json({ error: String(err?.message || "invalid_dns_query") });
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

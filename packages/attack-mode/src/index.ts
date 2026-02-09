import * as crypto from "node:crypto";

export enum AttackMode {
  NORMAL = "NORMAL",
  SUSPICIOUS = "SUSPICIOUS",
  UNDER_ATTACK = "UNDER_ATTACK",
  ISOLATED = "ISOLATED",
  RECOVERY = "RECOVERY"
}

export type AttackSignals = {
  rpcFailPct?: number;            // 0..100
  rpcDisagreement?: boolean;
  invalidReceiptPct?: number;     // 0..100
  receiptSampleSize?: number;
  canonicalFlipCount?: number;    // count in rolling window (per-name or global)
  ipfsFailPct?: number;           // 0..100
  gatewayErrorPct?: number;        // 0..100
  nowUnix?: number;
};

export type AttackModeDecision = {
  nextMode: AttackMode;
  score: number;     // 0..100
  reasons: string[];
};

export type AttackPolicy = {
  minRpcQuorum: number;
  requireStakeForReceipts: boolean;
  maxReceiptsPerWalletPerMin: number;
  maxWritesPerWalletPerHour: number;
  freezeWrites: boolean;
  ttlClampS: number;
};

export type AttackThresholds = {
  rpcFailPctSuspicious: number;
  invalidReceiptPctUnderAttack: number;
  invalidReceiptMinSample: number;
  canonicalFlipLimit: number;
  recoveryStableSecs: number;
};

export function defaultThresholdsFromEnv(env: Record<string, string | undefined> = process.env): AttackThresholds {
  return {
    rpcFailPctSuspicious: num(env.ATTACK_RPC_FAIL_PCT, 30),
    invalidReceiptPctUnderAttack: num(env.ATTACK_INVALID_RECEIPT_PCT, 5),
    invalidReceiptMinSample: num(env.ATTACK_INVALID_RECEIPT_MIN_SAMPLE, 500),
    canonicalFlipLimit: num(env.ATTACK_CANONICAL_FLIP_LIMIT, 2),
    recoveryStableSecs: num(env.ATTACK_RECOVERY_STABLE_SECS, 600)
  };
}

export function policyForMode(mode: AttackMode): AttackPolicy {
  switch (mode) {
    case AttackMode.NORMAL:
      return {
        minRpcQuorum: 1,
        requireStakeForReceipts: false,
        maxReceiptsPerWalletPerMin: 120,
        maxWritesPerWalletPerHour: 30,
        freezeWrites: false,
        ttlClampS: 0
      };
    case AttackMode.SUSPICIOUS:
      return {
        minRpcQuorum: 2,
        requireStakeForReceipts: false,
        maxReceiptsPerWalletPerMin: 60,
        maxWritesPerWalletPerHour: 10,
        freezeWrites: false,
        ttlClampS: 300
      };
    case AttackMode.UNDER_ATTACK:
      return {
        minRpcQuorum: 3,
        requireStakeForReceipts: true,
        maxReceiptsPerWalletPerMin: 20,
        maxWritesPerWalletPerHour: 0,
        freezeWrites: true,
        ttlClampS: 60
      };
    case AttackMode.ISOLATED:
      return {
        minRpcQuorum: 2,
        requireStakeForReceipts: true,
        maxReceiptsPerWalletPerMin: 10,
        maxWritesPerWalletPerHour: 0,
        freezeWrites: true,
        ttlClampS: 60
      };
    case AttackMode.RECOVERY:
      return {
        minRpcQuorum: 2,
        requireStakeForReceipts: false,
        maxReceiptsPerWalletPerMin: 60,
        maxWritesPerWalletPerHour: 10,
        freezeWrites: false,
        ttlClampS: 300
      };
    default:
      return policyForMode(AttackMode.NORMAL);
  }
}

export function evaluateAttackMode(
  prev: AttackMode,
  signals: AttackSignals,
  thresholds: AttackThresholds,
  memory: { lastStableUnix?: number } = {}
): AttackModeDecision & { memory: { lastStableUnix?: number } } {
  const reasons: string[] = [];
  const now = signals.nowUnix ?? Math.floor(Date.now() / 1000);

  // ISOLATED is a hard safety signal: disagreement means we can't trust a single view.
  if (signals.rpcDisagreement) {
    reasons.push("rpc_disagreement");
    return { nextMode: AttackMode.ISOLATED, score: 100, reasons, memory: { lastStableUnix: undefined } };
  }

  let score = 0;

  const rpcFail = clampPct(signals.rpcFailPct ?? 0);
  if (rpcFail > thresholds.rpcFailPctSuspicious) {
    score += 30;
    reasons.push(`rpc_fail_pct>${thresholds.rpcFailPctSuspicious}`);
  }

  const invalidPct = clampPct(signals.invalidReceiptPct ?? 0);
  const sample = signals.receiptSampleSize ?? 0;
  if (sample >= thresholds.invalidReceiptMinSample && invalidPct > thresholds.invalidReceiptPctUnderAttack) {
    // This is a strong signal: treat as "under attack" by default.
    score += 70;
    reasons.push(`invalid_receipt_pct>${thresholds.invalidReceiptPctUnderAttack}@${sample}`);
  }

  const flips = signals.canonicalFlipCount ?? 0;
  if (flips > thresholds.canonicalFlipLimit) {
    score += 40;
    reasons.push(`canonical_flips>${thresholds.canonicalFlipLimit}`);
  }

  const ipfsFail = clampPct(signals.ipfsFailPct ?? 0);
  if (ipfsFail > 50) {
    score += 10;
    reasons.push("ipfs_fail_pct>50");
  }

  const gwErr = clampPct(signals.gatewayErrorPct ?? 0);
  if (gwErr > 20) {
    score += 10;
    reasons.push("gateway_error_pct>20");
  }

  score = Math.min(100, score);

  const isStable = score === 0;
  const lastStableUnix = isStable ? now : (memory.lastStableUnix ?? undefined);
  const stableFor = isStable && memory.lastStableUnix ? now - memory.lastStableUnix : 0;

  // Transition logic (minimal hysteresis).
  let next: AttackMode = prev;

  if (score >= 60) next = AttackMode.UNDER_ATTACK;
  else if (score >= 20) next = AttackMode.SUSPICIOUS;
  else next = AttackMode.NORMAL;

  // Recovery: if previously severe, require stability time before leaving.
  if (prev === AttackMode.UNDER_ATTACK || prev === AttackMode.ISOLATED) {
    if (isStable) {
      if (!memory.lastStableUnix) {
        next = AttackMode.RECOVERY;
      } else if (stableFor >= thresholds.recoveryStableSecs) {
        next = AttackMode.NORMAL;
      } else {
        next = AttackMode.RECOVERY;
      }
    } else {
      next = prev === AttackMode.ISOLATED ? AttackMode.ISOLATED : AttackMode.UNDER_ATTACK;
    }
  } else if (prev === AttackMode.RECOVERY) {
    if (isStable && memory.lastStableUnix && stableFor >= thresholds.recoveryStableSecs) next = AttackMode.NORMAL;
    else if (score >= 60) next = AttackMode.UNDER_ATTACK;
    else if (score >= 20) next = AttackMode.SUSPICIOUS;
    else next = AttackMode.RECOVERY;
  }

  return { nextMode: next, score, reasons, memory: { lastStableUnix } };
}

export type MultiRpcAccountResult =
  | { ok: true; dataBase64: string; dataHashHex: string; agreeingUrls: string[]; slot: number }
  | { ok: false; evidence: Array<{ url: string; ok: boolean; slot?: number; dataHashHex?: string; err?: string }>; disagreement: boolean };

export async function fetchAccountMultiRpc(params: {
  account: string;
  rpcUrls: string[];
  minAgree: number;
  commitment?: "processed" | "confirmed" | "finalized";
  timeoutMs?: number;
}): Promise<MultiRpcAccountResult> {
  const { account, rpcUrls, minAgree } = params;
  const commitment = params.commitment ?? "confirmed";
  const timeoutMs = params.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const evidence: Array<{ url: string; ok: boolean; slot?: number; dataHashHex?: string; err?: string }> = [];
    const groups = new Map<string, { urls: string[]; slot: number; dataBase64: string }>();

    await Promise.all(rpcUrls.map(async (url) => {
      try {
        const body = {
          jsonrpc: "2.0",
          id: 1,
          method: "getAccountInfo",
          params: [account, { encoding: "base64", commitment }]
        };
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        if (!res.ok) {
          evidence.push({ url, ok: false, err: `http_${res.status}` });
          return;
        }
        const json: any = await res.json();
        const slot = Number(json?.result?.context?.slot ?? 0);
        const value = json?.result?.value;
        const dataBase64 = Array.isArray(value?.data) ? String(value.data[0] || "") : "";
        const dataHashHex = hashHex(dataBase64);
        evidence.push({ url, ok: true, slot, dataHashHex });

        const g = groups.get(dataHashHex);
        if (g) g.urls.push(url);
        else groups.set(dataHashHex, { urls: [url], slot, dataBase64 });
      } catch (err: any) {
        evidence.push({ url, ok: false, err: String(err?.message || err) });
      }
    }));

    // Pick the largest agreeing group.
    let best: { urls: string[]; slot: number; dataBase64: string; dataHashHex: string } | null = null;
    for (const [dataHashHex, g] of groups.entries()) {
      if (!best || g.urls.length > best.urls.length) best = { ...g, dataHashHex };
    }

    const disagreement = groups.size > 1;
    if (!best || best.urls.length < minAgree) {
      return { ok: false, evidence, disagreement };
    }
    return { ok: true, dataBase64: best.dataBase64, dataHashHex: best.dataHashHex, agreeingUrls: best.urls, slot: best.slot };
  } finally {
    clearTimeout(timer);
  }
}

function hashHex(dataBase64: string): string {
  const buf = Buffer.from(dataBase64 || "", "base64");
  return `0x${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

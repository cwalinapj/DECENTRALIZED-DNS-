import express from "express";
import type { Request, Response } from "express";
import {
  AttackMode,
  defaultThresholdsFromEnv,
  evaluateAttackMode,
  policyForMode
} from "@ddns/attack-mode";

type ReceiptIn = {
  wallet: string;
  valid: boolean;
  hasStake?: boolean;
  tsUnix?: number;
};

type WindowCounters = {
  total: number;
  invalid: number;
  lastResetUnix: number;
  perWallet: Map<string, { count: number; windowStartUnix: number }>;
};

const PORT = Number(process.env.PORT || "8790");

const thresholds = defaultThresholdsFromEnv(process.env);

let mode: AttackMode = AttackMode.NORMAL;
let modeMemory: { lastStableUnix?: number } = {};
let lastDecision: { score: number; reasons: string[] } = { score: 0, reasons: [] };

const counters: WindowCounters = {
  total: 0,
  invalid: 0,
  lastResetUnix: Math.floor(Date.now() / 1000),
  perWallet: new Map()
};

const WINDOW_SECS = Number(process.env.ATTACK_WINDOW_SECS || "120");

function maybeReset(now: number) {
  if (now - counters.lastResetUnix >= WINDOW_SECS) {
    counters.total = 0;
    counters.invalid = 0;
    counters.lastResetUnix = now;
    counters.perWallet.clear();
  }
}

function updateMode(now: number) {
  if (process.env.ATTACK_MODE_ENABLED !== "1") {
    mode = AttackMode.NORMAL;
    lastDecision = { score: 0, reasons: ["disabled"] };
    return;
  }
  const invalidPct = counters.total ? (counters.invalid * 100) / counters.total : 0;
  const decision = evaluateAttackMode(
    mode,
    {
      invalidReceiptPct: invalidPct,
      receiptSampleSize: counters.total,
      nowUnix: now
    },
    thresholds,
    modeMemory
  );
  mode = decision.nextMode;
  modeMemory = decision.memory;
  lastDecision = { score: decision.score, reasons: decision.reasons };
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/v1/health", (_req: Request, res: Response) => {
    const now = Math.floor(Date.now() / 1000);
    maybeReset(now);
    updateMode(now);
    const policy = policyForMode(mode);
    return res.json({
      ok: true,
      mode,
      decision: lastDecision,
      policy,
      window: {
        secs: WINDOW_SECS,
        total: counters.total,
        invalid: counters.invalid,
        invalidPct: counters.total ? (counters.invalid * 100) / counters.total : 0
      }
    });
  });

  app.post("/v1/submit-receipts", (req: Request, res: Response) => {
    const now = Math.floor(Date.now() / 1000);
    maybeReset(now);
    updateMode(now);
    const policy = policyForMode(mode);

    const receipts = Array.isArray(req.body?.receipts) ? (req.body.receipts as ReceiptIn[]) : [];
    if (!receipts.length) return res.status(400).json({ ok: false, error: "missing_receipts" });

    let accepted = 0;
    let rejected = 0;

    for (const r of receipts) {
      counters.total += 1;
      if (!r || typeof r.wallet !== "string") {
        counters.invalid += 1;
        rejected += 1;
        continue;
      }
      if (!r.valid) counters.invalid += 1;

      if (policy.requireStakeForReceipts && r.hasStake !== true) {
        rejected += 1;
        continue;
      }

      const w = r.wallet;
      const record = counters.perWallet.get(w) || { count: 0, windowStartUnix: now };
      // Per-wallet minute window (MVP anti-spam).
      if (now - record.windowStartUnix >= 60) {
        record.count = 0;
        record.windowStartUnix = now;
      }
      record.count += 1;
      counters.perWallet.set(w, record);
      if (record.count > policy.maxReceiptsPerWalletPerMin) {
        rejected += 1;
        continue;
      }

      accepted += 1;
    }

    // Recompute mode after ingestion (invalid flood should flip mode).
    updateMode(now);
    const after = policyForMode(mode);

    return res.json({
      ok: true,
      accepted,
      rejected,
      mode,
      decision: lastDecision,
      policy: after,
      window: { total: counters.total, invalid: counters.invalid }
    });
  });

  return app;
}

const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
if (!isTestEnv && process.env.MINER_WITNESS_NO_LISTEN !== "1") {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(
      `miner-witness listening on ${PORT} (attack_mode=${process.env.ATTACK_MODE_ENABLED === "1" ? "on" : "off"})`
    );
  });
}

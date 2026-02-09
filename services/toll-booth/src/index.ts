import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  AttackMode,
  defaultThresholdsFromEnv,
  evaluateAttackMode,
  policyForMode
} from "@ddns/attack-mode";

type RouteRecordV1 = {
  v: 1;
  name: string;
  dest: string;
  ttl: number;
  issued_at: number;
  expires_at: number;
  owner: string;
  nonce: string;
};

type WitnessAttestationV1 = {
  v: 1;
  route_id: string;
  witness: string;
  sig: string;
  ts: number;
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 8787);
const DB_DIR = path.resolve("tollbooth-db");
const ROUTES_DIR = path.join(DB_DIR, "routes");
const CREDITS_DIR = path.join(DB_DIR, "credits");
fs.mkdirSync(ROUTES_DIR, { recursive: true });
fs.mkdirSync(CREDITS_DIR, { recursive: true });

const TRUSTED_WITNESSES_PATH = path.resolve("config/trusted_witnesses.json");
const OWNERS_ALLOW_PATH = path.resolve("config/owners_allow.json");

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID =
  process.env.DDNS_PROGRAM_ID ||
  "9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes";

const QUORUM = Number(process.env.QUORUM || 2);
const ATTACK_MODE_ENABLED = process.env.ATTACK_MODE_ENABLED === "1";
const ATTACK_WINDOW_SECS = Number(process.env.ATTACK_WINDOW_SECS || "120");
const attackThresholds = defaultThresholdsFromEnv(process.env);

type AttackCounters = {
  windowStartUnix: number;
  totalWrites: number;
  writeErrors: number;
};

const attackCounters: AttackCounters = {
  windowStartUnix: Math.floor(Date.now() / 1000),
  totalWrites: 0,
  writeErrors: 0
};

let attackMode: AttackMode = AttackMode.NORMAL;
let attackMemory: { lastStableUnix?: number } = {};
let attackDecision: { score: number; reasons: string[] } = { score: 0, reasons: [] };

function resetAttackWindow(nowUnix: number) {
  if (nowUnix - attackCounters.windowStartUnix >= ATTACK_WINDOW_SECS) {
    attackCounters.windowStartUnix = nowUnix;
    attackCounters.totalWrites = 0;
    attackCounters.writeErrors = 0;
  }
}

function currentAttackPolicy(nowUnix: number) {
  resetAttackWindow(nowUnix);
  if (!ATTACK_MODE_ENABLED) {
    attackMode = AttackMode.NORMAL;
    attackDecision = { score: 0, reasons: ["disabled"] };
    return policyForMode(attackMode);
  }
  const writeErrPct = attackCounters.totalWrites
    ? (attackCounters.writeErrors * 100) / attackCounters.totalWrites
    : 0;
  const decision = evaluateAttackMode(
    attackMode,
    { gatewayErrorPct: writeErrPct, nowUnix },
    attackThresholds,
    attackMemory
  );
  attackMode = decision.nextMode;
  attackMemory = decision.memory;
  attackDecision = { score: decision.score, reasons: decision.reasons };
  return policyForMode(attackMode);
}

function loadJson<T>(p: string, fallback: T): T {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return Number.isInteger(value) ? value.toString() : value.toString();
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]));
    return "{" + parts.join(",") + "}";
  }
  throw new Error("unsupported type in canonicalize");
}

function routeId(route: RouteRecordV1): string {
  const canonical = canonicalize(route);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function isValidRoute(route: RouteRecordV1): string | null {
  if (!route || route.v !== 1) return "invalid route version";
  if (!route.name || !route.dest || !route.owner) return "missing fields";
  if (!Number.isFinite(route.ttl) || route.ttl <= 0) return "invalid ttl";
  if (!route.issued_at || !route.expires_at) return "missing timestamps";
  return null;
}

function verifyWitness(
  routeHashHex: string,
  att: WitnessAttestationV1,
  trusted: Set<string>
): boolean {
  if (att.v !== 1) return false;
  if (!trusted.has(att.witness)) return false;
  const msg = Buffer.from(routeHashHex, "hex");
  const sig = Buffer.from(att.sig, "base64");
  const pubkey = bs58.decode(att.witness);
  return nacl.sign.detached.verify(msg, sig, pubkey);
}

async function ownerHasTollPass(owner: string): Promise<boolean> {
  const allowList = new Set(loadJson<string[]>(OWNERS_ALLOW_PATH, []));
  if (allowList.has(owner)) return true;

  try {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const ownerPk = new PublicKey(owner);
    const programId = new PublicKey(PROGRAM_ID);
    const [tollPass] = PublicKey.findProgramAddressSync(
      [Buffer.from("toll_pass"), ownerPk.toBuffer()],
      programId
    );
    const info = await connection.getAccountInfo(tollPass, "confirmed");
    return !!info;
  } catch {
    return false;
  }
}

app.post("/v1/route/submit", async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const policy = currentAttackPolicy(now);
    attackCounters.totalWrites += 1;
    if (policy.freezeWrites) {
      return res.status(503).json({ ok: false, error: "attack_mode_freeze_writes", mode: attackMode, reasons: attackDecision.reasons });
    }

    const route = req.body.route as RouteRecordV1;
    const witnesses = (req.body.witnesses || []) as WitnessAttestationV1[];
    const err = isValidRoute(route);
    if (err) return res.status(400).send(err);

    const computedId = routeId(route);
    const trustedList = loadJson<string[]>(TRUSTED_WITNESSES_PATH, []);
    const trustedSet = new Set(trustedList);
    const validWitnesses = new Set<string>();

    for (const w of witnesses) {
      if (w.route_id !== computedId) continue;
      if (verifyWitness(computedId, w, trustedSet)) {
        validWitnesses.add(w.witness);
      }
    }
    if (validWitnesses.size < QUORUM) {
      return res
        .status(400)
        .send(`quorum not met: ${validWitnesses.size}/${QUORUM}`);
    }

    const hasPass = await ownerHasTollPass(route.owner);
    if (!hasPass) {
      return res.status(400).send("owner has no toll pass");
    }

    const file = path.join(ROUTES_DIR, `${computedId}.json`);
    fs.writeFileSync(file, JSON.stringify({ route, witnesses }, null, 2));

    const creditFile = path.join(CREDITS_DIR, `${route.owner}.json`);
    const credit = loadJson<{ points: number }>(creditFile, { points: 0 });
    credit.points += 1;
    fs.writeFileSync(creditFile, JSON.stringify(credit, null, 2));

    return res.json({ ok: true, route_id: computedId });
  } catch (e: any) {
    attackCounters.writeErrors += 1;
    return res.status(500).send(e?.message || "server_error");
  }
});

app.get("/v1/route/:route_id", (req, res) => {
  const routeId = req.params.route_id;
  const file = path.join(ROUTES_DIR, `${routeId}.json`);
  if (!fs.existsSync(file)) return res.status(404).send("not_found");
  return res.sendFile(file);
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
      totalWrites: attackCounters.totalWrites,
      writeErrors: attackCounters.writeErrors
    }
  });
});

app.listen(PORT, () => {
  console.log(`toll-booth listening on ${PORT}`);
});

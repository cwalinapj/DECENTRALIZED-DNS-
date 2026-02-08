import fs from "node:fs";
import path from "node:path";
import { runIntegrityChecks } from "./checks.js";
import { attemptFix } from "./fix.js";
import { buildOwnerReport } from "./report.js";
import { buildRewardStatus } from "./reward_status.js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

const STATE_DIR = process.env.DDNS_STATE_DIR || "/state";
const INTERVAL_SEC = Number(process.env.DDNS_INTEGRITY_INTERVAL_SEC || "60");
const FIX_COOLDOWN_SEC = Number(process.env.DDNS_FIX_COOLDOWN_SEC || "180");
const ALERT_WEBHOOK = process.env.DDNS_ALERT_WEBHOOK || "";

const components = [
  { component: "edge-node", image: "ddns-edge-node" },
  { component: "watchdog", image: "ddns-watchdog" },
  { component: "ipfs-anchor", image: "ddns-ipfs-anchor" },
  { component: "miner-gui", image: "ddns-miner-gui" }
];

async function sendWebhook(msg: string) {
  if (!ALERT_WEBHOOK) return;
  try {
    await fetch(ALERT_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: msg }) });
  } catch {
    // ignore webhook failures
  }
}

function writeFile(p: string, data: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

async function tick() {
  const rpcUrl = mustEnv("EVM_RPC_URL");
  const registry = mustEnv("BUILD_REGISTRY_CONTRACT");

  const snap = await runIntegrityChecks({ rpcUrl, buildRegistry: registry, components });
  const fixActions = attemptFix(snap, FIX_COOLDOWN_SEC);

  const report = buildOwnerReport(snap, fixActions);
  const reward = buildRewardStatus(snap);

  writeFile(path.join(STATE_DIR, "integrity_status.json"), JSON.stringify(snap, null, 2));
  writeFile(path.join(STATE_DIR, "reward_status.json"), JSON.stringify(reward, null, 2));
  writeFile(path.join(STATE_DIR, "integrity_report.md"), report);

  if (!snap.ok) {
    await sendWebhook(`DDNS Miner integrity FAIL on ${components.length} components. Check GUI and /state/integrity_report.md`);
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`integrity-daemon starting. interval=${INTERVAL_SEC}s state_dir=${STATE_DIR}`);
  for (;;) {
    try { await tick(); }
    catch (e: any) {
      // Always write a failure report so owner can see it
      const msg = `integrity-daemon error: ${String(e?.message || e)}`;
      writeFile(path.join(STATE_DIR, "integrity_report.md"), `# Integrity Daemon Error\n\n${msg}\n`);
      await sendWebhook(msg);
    }
    await new Promise(r => setTimeout(r, INTERVAL_SEC * 1000));
  }
}

main();

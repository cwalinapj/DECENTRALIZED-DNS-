import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getServiceStatuses } from "./checks.js";
import { autoRecover } from "./recover.js";
import { startJob, readJob } from "./jobs.js";
import { addClient, removeClient, broadcast } from "./events.js";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8080;

const services = (process.env.DDNS_SERVICES || "edge-node,watchdog,ipfs-anchor")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const recoveryEnabled = (process.env.DDNS_RECOVERY_ENABLED || "true") === "true";
const cooldownSec = Number(process.env.DDNS_RECOVERY_COOLDOWN_SEC || "120");

app.get("/api/status", async (_req, res) => {
  try {
    const statuses = await getServiceStatuses(services);
    const actions = await autoRecover(statuses, { enabled: recoveryEnabled, cooldownSec });
    res.json({ ok: true, services: statuses, recovery: { enabled: recoveryEnabled, actions } });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.use("/", express.static(path.join(__dirname, "../web")));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ddns-miner-gui listening on :${PORT}`);
});

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "node:fs";
import { getServiceStatuses } from "./checks.js";
import { autoRecover } from "./recovery.js";
import { startJob, readJob } from "./src/jobs.js";
import { addClient, removeClient, broadcast } from "./events.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = 8080;
// Needed for future POST bodies (even if current endpoints don't use it yet)
app.use(express.json({ limit: "256kb" }));
const services = (process.env.DDNS_SERVICES || "edge-node,watchdog,ipfs-anchor")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const recoveryEnabled = (process.env.DDNS_RECOVERY_ENABLED || "true") === "true";
const cooldownSec = Number(process.env.DDNS_RECOVERY_COOLDOWN_SEC || "120");
const STATE_DIR = process.env.DDNS_STATE_DIR || "/state";
const REPORT_PATH = path.join(STATE_DIR, "integrity_report.md");
const REWARD_PATH = path.join(STATE_DIR, "reward_status.json");
// ----- Core APIs -----
app.get("/api/status", async (_req, res) => {
    try {
        const statuses = await getServiceStatuses(services);
        const actions = await autoRecover(statuses, { enabled: recoveryEnabled, cooldownSec });
        res.json({ ok: true, services: statuses, recovery: { enabled: recoveryEnabled, actions } });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/api/report", (_req, res) => {
    try {
        const text = fs.existsSync(REPORT_PATH) ? fs.readFileSync(REPORT_PATH, "utf8") : "no report yet";
        res.json({ ok: true, report: text });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/api/reward", (_req, res) => {
    try {
        const reward = fs.existsSync(REWARD_PATH)
            ? JSON.parse(fs.readFileSync(REWARD_PATH, "utf8"))
            : { eligible: false, reason: "no_status_yet" };
        res.json({ ok: true, reward });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// ----- SSE Events -----
app.get("/api/events", (req, res) => {
    const id = String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    addClient(id, res);
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, services })}\n\n`);
    req.on("close", () => removeClient(id));
});
// ----- Jobs (workers do the work) -----
app.post("/api/jobs/diagnose", (_req, res) => {
    try {
        // Requires worker artifacts to exist in the GUI container:
        //   /workers/diagnostics/dist/diagnose.js
        const job = startJob("diagnose", "node", ["/workers/diagnostics/dist/diagnose.js"], {
            EVM_RPC_URL: process.env.EVM_RPC_URL,
            BUILD_REGISTRY_CONTRACT: process.env.BUILD_REGISTRY_CONTRACT
        });
        broadcast("job", { kind: "diagnose", id: job.id, state: job.state });
        res.json({ ok: true, job });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.post("/api/jobs/fix", (_req, res) => {
    try {
        // Requires:
        //   /workers/diagnostics/dist/fix_now.js
        const job = startJob("fix", "node", ["/workers/diagnostics/dist/fix_now.js"], {});
        broadcast("job", { kind: "fix", id: job.id, state: job.state });
        res.json({ ok: true, job });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
app.get("/api/jobs/:id", (req, res) => {
    const job = readJob(req.params.id);
    if (!job)
        return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true, job });
});
// ----- Static web -----
app.use("/", express.static(path.join(__dirname, "../web")));
// ----- Background broadcaster (thin server, pushes snapshots) -----
async function broadcastStatusTick() {
    try {
        const statuses = await getServiceStatuses(services);
        const actions = await autoRecover(statuses, { enabled: recoveryEnabled, cooldownSec });
        // Push status snapshot to all SSE clients
        broadcast("status", {
            time: Math.floor(Date.now() / 1000),
            services: statuses,
            recovery: { enabled: recoveryEnabled, actions }
        });
    }
    catch (e) {
        broadcast("error", { time: Math.floor(Date.now() / 1000), error: String(e?.message || e) });
    }
}
// Light job file watcher: emit job completion events
function jobEventWatcher() {
    const jobsDir = path.join(STATE_DIR, "jobs");
    fs.mkdirSync(jobsDir, { recursive: true });
    let lastSeen = new Set();
    setInterval(() => {
        try {
            const files = fs.readdirSync(jobsDir).filter((f) => f.endsWith(".json"));
            for (const f of files) {
                if (lastSeen.has(f))
                    continue;
                // Don't mark seen immediately; only emit when terminal state appears
                const full = path.join(jobsDir, f);
                const j = JSON.parse(fs.readFileSync(full, "utf8"));
                if (j?.state === "done" || j?.state === "failed") {
                    lastSeen.add(f);
                    broadcast("job_done", { id: j.id, kind: j.kind, state: j.state, error: j.error || null });
                }
            }
        }
        catch {
            // ignore
        }
    }, 2000);
}
app.listen(PORT, () => {
    console.log(`ddns-miner-gui listening on :${PORT}`);
    // Push status snapshots periodically (reduces polling)
    setInterval(broadcastStatusTick, 5000);
    broadcastStatusTick().catch(() => { });
    // Watch for completed jobs and push to SSE clients
    jobEventWatcher();
});

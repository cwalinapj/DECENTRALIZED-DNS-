import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const JOB_DIR = "/state/jobs";
function now() { return Math.floor(Date.now() / 1000); }
function randId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function writeJob(job) {
    fs.mkdirSync(JOB_DIR, { recursive: true });
    fs.writeFileSync(path.join(JOB_DIR, `${job.id}.json`), JSON.stringify(job, null, 2));
}
export function readJob(id) {
    const p = path.join(JOB_DIR, `${id}.json`);
    if (!fs.existsSync(p))
        return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
}
/**
 * Runs a local worker script (node) and stores JSON output.
 * Worker MUST print a JSON object to stdout on success.
 */
export function startJob(kind, cmd, args, env = {}) {
    const id = randId();
    const job = { id, kind, state: "queued" };
    writeJob(job);
    const child = spawn(cmd, args, {
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"]
    });
    const running = { ...job, state: "running", startedAt: now() };
    writeJob(running);
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c.toString("utf8")));
    child.stderr.on("data", (c) => (err += c.toString("utf8")));
    child.on("close", (code) => {
        try {
            if (code === 0) {
                const parsed = JSON.parse(out || "{}");
                writeJob({ ...running, state: "done", finishedAt: now(), output: parsed });
            }
            else {
                writeJob({ ...running, state: "failed", finishedAt: now(), error: `exit=${code}; ${err.slice(0, 2000)}` });
            }
        }
        catch (e) {
            writeJob({ ...running, state: "failed", finishedAt: now(), error: `parse_error: ${String(e?.message || e)}; stderr=${err.slice(0, 2000)}` });
        }
    });
    return running;
}

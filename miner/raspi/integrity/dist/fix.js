import { execFileSync } from "node:child_process";
const lastFix = {};
export function attemptFix(snapshot, cooldownSec = 180) {
    const now = Math.floor(Date.now() / 1000);
    const actions = [];
    for (const c of snapshot.components) {
        const key = c.component;
        const last = lastFix[key] ?? 0;
        if (now - last < cooldownSec)
            continue;
        // If watchdog unhealthy/exited -> restart
        if (c.component === "watchdog" && c.containerId) {
            if (c.health === "unhealthy" || (c.state === "exited" && (c.exitCode ?? 0) !== 0)) {
                try {
                    execFileSync("docker", ["restart", c.containerId], { stdio: "ignore" });
                    lastFix[key] = now;
                    actions.push({ component: key, action: "restart_container", ok: true });
                    continue;
                }
                catch (e) {
                    actions.push({ component: key, action: "restart_container", ok: false, detail: String(e?.message || e) });
                }
            }
        }
        // Build hash mismatch -> try pull & restart (best-effort)
        if (c.problems.includes("build_hash_mismatch")) {
            try {
                // If the image is locally built, pull may not work; but it’s safe to attempt.
                execFileSync("docker", ["pull", c.image], { stdio: "ignore" });
                if (c.containerId)
                    execFileSync("docker", ["restart", c.containerId], { stdio: "ignore" });
                lastFix[key] = now;
                actions.push({ component: key, action: "pull_image_and_restart", ok: true });
            }
            catch (e) {
                actions.push({ component: key, action: "pull_image_and_restart", ok: false, detail: String(e?.message || e) });
            }
        }
    }
    return actions;
}

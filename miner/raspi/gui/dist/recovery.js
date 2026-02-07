import { restartContainer } from "./docker.js";
const lastRestart = {};
export async function autoRecover(statuses, cfg) {
    if (!cfg.enabled)
        return [];
    const actions = [];
    const now = Math.floor(Date.now() / 1000);
    // Rule: If watchdog is unhealthy OR exited non-zero => restart it (with cooldown).
    const watchdog = statuses.find(s => s.name === "watchdog");
    if (watchdog?.containerId) {
        const last = lastRestart["watchdog"] ?? 0;
        const inCooldown = (now - last) < cfg.cooldownSec;
        const shouldRestart = (watchdog.health === "unhealthy") ||
            (watchdog.state === "exited" && (watchdog.exitCode ?? 0) !== 0);
        if (shouldRestart && !inCooldown) {
            await restartContainer(watchdog.containerId);
            lastRestart["watchdog"] = now;
            actions.push(`restarted watchdog (reason: ${watchdog.health === "unhealthy" ? "unhealthy" : "exited"})`);
        }
        else if (shouldRestart && inCooldown) {
            actions.push(`watchdog restart suppressed (cooldown ${cfg.cooldownSec}s)`);
        }
    }
    return actions;
}

import { inspectContainer, listContainers } from "../docker.js";
function findByNameHint(containers, hint) {
    // We set container_name to ddns-<service>, so we match that first.
    return containers.find(c => (c.Names || []).some((n) => n.includes(`ddns-${hint}`) || n.includes(hint)));
}
export async function getServiceStatuses(serviceNames) {
    const containers = await listContainers();
    const out = [];
    for (const svc of serviceNames) {
        const match = findByNameHint(containers, svc);
        if (!match) {
            out.push({ name: svc, error: "container not found" });
            continue;
        }
        const insp = await inspectContainer(match.Id);
        const st = insp?.State;
        out.push({
            name: svc,
            containerId: match.Id,
            state: st?.Status,
            health: st?.Health?.Status ?? "none",
            exitCode: st?.ExitCode,
            startedAt: st?.StartedAt,
            finishedAt: st?.FinishedAt,
            error: st?.Error || undefined
        });
    }
    return out;
}

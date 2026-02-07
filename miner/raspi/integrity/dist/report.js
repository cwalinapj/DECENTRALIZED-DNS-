export function buildOwnerReport(snapshot, fixActions) {
    const lines = [];
    lines.push(`# Miner Integrity Report`);
    lines.push(`- time: ${new Date(snapshot.time * 1000).toISOString()}`);
    lines.push(`- overall: ${snapshot.ok ? "OK ✅" : "FAIL ❌"}`);
    lines.push("");
    if (fixActions?.length) {
        lines.push(`## Auto-fix attempts`);
        for (const a of fixActions) {
            lines.push(`- **${a.component}**: ${a.action} => ${a.ok ? "OK" : "FAILED"}${a.detail ? ` (${a.detail})` : ""}`);
        }
        lines.push("");
    }
    lines.push(`## Component status`);
    for (const c of snapshot.components) {
        lines.push(`### ${c.component}`);
        lines.push(`- image: \`${c.image}\``);
        if (c.repoDigest)
            lines.push(`- repoDigest: \`${c.repoDigest}\``);
        if (c.localBuildHash)
            lines.push(`- localBuildHash: \`${c.localBuildHash}\``);
        if (c.approvedBuildHash)
            lines.push(`- approvedBuildHash: \`${c.approvedBuildHash}\` (v${c.approvedVersion ?? "?"})`);
        lines.push(`- state: \`${c.state ?? "unknown"}\`  health: \`${c.health ?? "none"}\``);
        lines.push(`- ok: ${c.ok ? "YES" : "NO"}`);
        if (c.problems.length)
            lines.push(`- problems: ${c.problems.join(", ")}`);
        lines.push("");
    }
    lines.push(`## What this means for rewards`);
    if (snapshot.ok) {
        lines.push(`- This node is **ELIGIBLE** for rewards (integrity checks pass).`);
    }
    else {
        lines.push(`- This node is **NOT ELIGIBLE** for rewards until issues are resolved.`);
    }
    lines.push("");
    lines.push(`## Owner actions (if auto-fix failed)`);
    lines.push(`1) Open the GUI: \`http://<raspi-ip>:8080\``);
    lines.push(`2) Check logs:`);
    lines.push(`   - \`docker compose logs -f watchdog\``);
    lines.push(`   - \`docker compose logs -f edge-node\``);
    lines.push(`3) If build hash mismatch persists:`);
    lines.push(`   - Ensure the Pi can reach your registry/RPC`);
    lines.push(`   - Pull/rebuild: \`docker compose pull && docker compose up -d\``);
    lines.push(`4) If EVM RPC failures:`);
    lines.push(`   - confirm \`.env\` has valid \`EVM_RPC_URL\`, \`BUILD_REGISTRY_CONTRACT\``);
    lines.push(`5) If containers won’t stay running:`);
    lines.push(`   - \`docker compose ps\` and inspect \`ExitCode\` / error logs`);
    lines.push("");
    return lines.join("\n");
}

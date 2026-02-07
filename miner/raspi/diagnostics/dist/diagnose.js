import { execFileSync } from "node:child_process";
import fs from "node:fs";
function sh(cmd, args = []) {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}
function safe(fn) {
    try {
        return fn();
    }
    catch (e) {
        return { error: String(e?.message || e) };
    }
}
function dockerLogs(name, tail = "200") {
    return safe(() => sh("docker", ["logs", "--tail", tail, name]));
}
function dockerPS() {
    return safe(() => sh("docker", ["ps", "-a", "--format", "{{.Names}}\t{{.Status}}\t{{.Image}}"]));
}
function disk() {
    return safe(() => sh("df", ["-h"]));
}
function nvmeMount() {
    return {
        exists: fs.existsSync("/mnt/nvme"),
        stateDirExists: fs.existsSync("/mnt/nvme/ddns/state"),
        edgeDataExists: fs.existsSync("/mnt/nvme/ddns/edge_data")
    };
}
async function rpcCheck(url) {
    try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) });
        const j = await r.json();
        if (j.error)
            return { ok: false, error: j.error.message || "rpc error" };
        return { ok: true, block: j.result };
    }
    catch (e) {
        return { ok: false, error: String(e?.message || e) };
    }
}
const main = async () => {
    const rpcUrl = process.env.EVM_RPC_URL || "";
    const registry = process.env.BUILD_REGISTRY_CONTRACT || "";
    const out = {
        time: Math.floor(Date.now() / 1000),
        env: { hasRpcUrl: !!rpcUrl, hasBuildRegistry: !!registry },
        nvme: nvmeMount(),
        docker: {
            ps: dockerPS(),
            logs: {
                "ddns-edge-node": dockerLogs("ddns-edge-node"),
                "ddns-watchdog": dockerLogs("ddns-watchdog"),
                "ddns-ipfs-anchor": dockerLogs("ddns-ipfs-anchor"),
                "ddns-miner-gui": dockerLogs("ddns-miner-gui"),
                "ddns-integrity-daemon": dockerLogs("ddns-integrity-daemon")
            }
        },
        system: {
            disk: disk()
        },
        evm: rpcUrl ? await rpcCheck(rpcUrl) : { ok: false, error: "EVM_RPC_URL not set" }
    };
    // Print JSON for the GUI job runner
    process.stdout.write(JSON.stringify(out, null, 2));
};
main();

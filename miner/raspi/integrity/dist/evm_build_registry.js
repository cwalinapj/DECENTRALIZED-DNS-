import { keccak_256 } from "@noble/hashes/sha3";
import { blake3 } from "@noble/hashes/blake3";
function utf8(s) { return new TextEncoder().encode(s); }
function hex0x(b) { return "0x" + Array.from(b).map(x => x.toString(16).padStart(2, "0")).join(""); }
async function rpcCall(rpcUrl, method, params) {
    const body = { jsonrpc: "2.0", id: 1, method, params };
    const r = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.error)
        throw new Error(j.error.message || "rpc error");
    return j.result;
}
export function componentId(componentName) {
    return hex0x(keccak_256(utf8(componentName)));
}
export function localBuildHashFromRepoDigest(repoDigest) {
    const h = blake3(utf8(repoDigest), { dkLen: 32 });
    return hex0x(h);
}
// selector for getApproved(bytes32) => 0x1c3b2f2e
export async function getApprovedBuild(rpcUrl, registry, componentIdHex0x) {
    const selector = "0x1c3b2f2e";
    const data = selector + componentIdHex0x.replace(/^0x/, "").padStart(64, "0");
    const res = await rpcCall(rpcUrl, "eth_call", [{ to: registry, data }, "latest"]);
    const raw = res.startsWith("0x") ? res.slice(2) : res;
    if (raw.length < 64 * 3)
        throw new Error("short eth_call result");
    const version = Number(BigInt("0x" + raw.slice(0, 64)));
    const buildHash = "0x" + raw.slice(64, 128);
    const updatedAt = Number(BigInt("0x" + raw.slice(128, 192)));
    return { version, buildHash, updatedAt };
}

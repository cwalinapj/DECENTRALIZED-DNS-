import { hexToBytes, bytesToHex } from "./hex.js";

type JsonRpcReq = { jsonrpc: "2.0"; id: number; method: string; params: any[] };

export async function rpcCall(rpcUrl: string, method: string, params: any[]): Promise<any> {
  const body: JsonRpcReq = { jsonrpc: "2.0", id: 1, method, params };
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result;
}

/**
 * Calls BuildRegistry.getApproved(bytes32) -> (uint32, bytes32, uint64)
 * selector = keccak256("getApproved(bytes32)")[0:4]
 */
export async function getApprovedBuild(rpcUrl: string, contract: string, componentIdHex0x: string) {
  const selector = "0x1c3b2f2e"; // precomputed for getApproved(bytes32)
  // calldata = selector + componentId (32 bytes)
  const data = selector + componentIdHex0x.replace(/^0x/, "").padStart(64, "0");

  const result: string = await rpcCall(rpcUrl, "eth_call", [
    { to: contract, data },
    "latest"
  ]);

  // result ABI: 3 * 32 bytes
  const raw = result.startsWith("0x") ? result.slice(2) : result;
  if (raw.length < 64 * 3) throw new Error("short eth_call result");

  const versionHex = raw.slice(0, 64);
  const buildHashHex = raw.slice(64, 128);
  const updatedAtHex = raw.slice(128, 192);

  const version = Number(BigInt("0x" + versionHex));
  const buildHash = "0x" + buildHashHex;
  const updatedAt = Number(BigInt("0x" + updatedAtHex));

  return { version, buildHash, updatedAt };
}

// Minimal hex helpers (local)
export function normalizeAddr(a: string): string {
  if (!a.startsWith("0x") || a.length !== 42) throw new Error("bad address");
  return a.toLowerCase();
}

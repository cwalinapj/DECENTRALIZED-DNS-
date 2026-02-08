import { Interface, namehash } from "ethers";
import type { ResolveRecord } from "../server.js";

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const resolverIface = new Interface(["function resolver(bytes32 node) view returns (address)"]);
const addrIface = new Interface(["function addr(bytes32 node) view returns (address)"]);
const contentIface = new Interface(["function contenthash(bytes32 node) view returns (bytes)"]);

export type EnsConfig = {
  rpcUrl: string;
  timeoutMs: number;
};

export function supportsEns(name: string): boolean {
  return name.toLowerCase().endsWith(".eth");
}

export async function resolveEns(name: string, config: EnsConfig): Promise<ResolveRecord[]> {
  if (!config.rpcUrl) throw new Error("ENS_RPC_MISSING");
  const node = namehash(name.toLowerCase());
  const resolverData = resolverIface.encodeFunctionData("resolver", [node]);
  const resolverAddress = await callRpc(config, ENS_REGISTRY, resolverData);
  if (!resolverAddress || resolverAddress === "0x0000000000000000000000000000000000000000") {
    return [];
  }

  const records: ResolveRecord[] = [];

  const addrData = addrIface.encodeFunctionData("addr", [node]);
  const addr = await callRpc(config, resolverAddress, addrData);
  if (addr && addr !== "0x0000000000000000000000000000000000000000") {
    records.push({ type: "ADDR", value: addr });
  }

  const contentData = contentIface.encodeFunctionData("contenthash", [node]);
  const content = await callRpc(config, resolverAddress, contentData);
  if (content && content !== "0x") {
    records.push({ type: "CONTENTHASH", value: content });
  }

  return records;
}

async function callRpc(config: EnsConfig, to: string, data: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"]
    };
    const res = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) throw new Error("ENS_UPSTREAM_ERROR");
    const body = await res.json();
    if (body.error) throw new Error("ENS_UPSTREAM_ERROR");
    return body.result;
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("ENS_TIMEOUT");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

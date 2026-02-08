import { MemoryCache } from "./tasks/cache.js";
import { createReceipt, canServeTor, canProxyChain } from "./tasks/verify.js";

export type AgentConfig = {
  wallet: string;
  privateKeyHex: string;
  coordinatorUrl: string;
};

const registryCache = new MemoryCache<any>();

export async function cacheRegistrySnapshot(url: string) {
  const res = await fetch(`${url}/registry/root`);
  if (!res.ok) throw new Error("registry_unavailable");
  const data = await res.json();
  registryCache.set("root", data, 30_000);
  return data;
}

export async function submitReceipt(config: AgentConfig, receipt: any) {
  const res = await fetch(`${config.coordinatorUrl}/receipts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(receipt)
  });
  if (!res.ok) throw new Error(`receipt_failed:${res.status}`);
  return await res.json();
}

export async function runServeTask(config: AgentConfig, name: string, responseHash: string) {
  const receipt = await createReceipt(config.privateKeyHex, {
    type: "SERVE",
    wallet: config.wallet,
    timestamp: new Date().toISOString(),
    payload: { name, responseHash }
  });
  return await submitReceipt(config, receipt);
}

export function enforceSafetyFlags(target: "tor" | "proxy") {
  if (target === "tor" && !canServeTor()) throw new Error("tor_disabled");
  if (target === "proxy" && !canProxyChain()) throw new Error("proxy_disabled");
}

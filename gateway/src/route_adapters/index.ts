// Legacy compatibility shim.
//
// Older PRs in this repo used `src/route_adapters/*`. The current adapter layer
// lives under `src/adapters/*`. Keep this module compiling so it doesn't break
// the gateway build/test pipeline, but route all behavior to the new adapters.
import type { RouteAnswer } from "../adapters/types.js";
import type { Adapter } from "../adapters/shim.js";
import {
  createAdapterRegistry,
  createArweaveAdapterStub,
  createEnsAdapter,
  createFilecoinAdapterStub,
  createHandshakeAdapterStub,
  createIpfsAdapter,
  createPkdnsAdapter,
  createSnsAdapter
} from "../adapters/index.js";

export type AdapterRegistryConfig = {
  // Legacy config keys kept to avoid churn; unused by the current PKDNS adapter.
  registryPath?: string;
  anchorStorePath?: string;
  solanaRpcUrl: string;
  ethRpcUrl: string;
  ddnsRegistryProgramId: string;
  policyProgramId?: string; // ddns_watchdog_policy
  ipfsHttpGatewayBaseUrl: string;
};

export function buildDefaultAdapters(cfg: AdapterRegistryConfig): Adapter[] {
  return [
    createPkdnsAdapter({
      solanaRpcUrl: cfg.solanaRpcUrl,
      ddnsRegistryProgramId: cfg.ddnsRegistryProgramId,
      ddnsWatchdogPolicyProgramId: cfg.policyProgramId
    }),
    createIpfsAdapter({ httpGateways: [cfg.ipfsHttpGatewayBaseUrl] }),
    createEnsAdapter({ rpcUrl: cfg.ethRpcUrl, chainId: 1 }),
    createSnsAdapter({ rpcUrl: cfg.solanaRpcUrl }),
    // Stubs (interfaces exist, but not wired yet).
    createHandshakeAdapterStub(),
    createFilecoinAdapterStub(),
    createArweaveAdapterStub()
  ];
}

export async function resolveRouteAnswer(
  adapters: Adapter[],
  input: { name: string; nowUnix?: number; network?: string; opts?: Record<string, any> }
): Promise<RouteAnswer> {
  const registry = createAdapterRegistry({
    pkdns: adapters.find((a) => a.kind === "pkdns"),
    ipfs: adapters.find((a) => a.kind === "ipfs"),
    ens: adapters.find((a) => a.kind === "ens"),
    sns: adapters.find((a) => a.kind === "sns"),
    handshake: adapters.find((a) => a.kind === "handshake"),
    filecoin: adapters.find((a) => a.kind === "filecoin"),
    arweave: adapters.find((a) => a.kind === "arweave")
  });
  return registry.resolveAuto(input);
}

import type { RouteAnswer } from "./types.js";
import type { AdapterResolveOptions, RouteAdapter } from "./adapter.js";
import { pkdnsAdapter } from "./pkdns.js";
import { ipfsAdapter } from "./ipfs.js";
import { ensAdapter } from "./ens.js";
import { snsAdapter } from "./sns.js";
import { arweaveAdapterStub, filecoinAdapterStub, handshakeAdapterStub } from "./stubs.js";

export type AdapterRegistryConfig = {
  registryPath: string;
  anchorStorePath: string;
  solanaRpcUrl: string;
  ethRpcUrl: string;
  policyProgramId?: string; // ddns_watchdog_policy
  ipfsHttpGatewayBaseUrl: string;
};

export function buildDefaultAdapters(cfg: AdapterRegistryConfig): RouteAdapter[] {
  return [
    pkdnsAdapter({
      registryPath: cfg.registryPath,
      anchorStorePath: cfg.anchorStorePath,
      solanaRpcUrl: cfg.solanaRpcUrl,
      policyProgramId: cfg.policyProgramId
    }),
    ipfsAdapter({ httpGatewayBaseUrl: cfg.ipfsHttpGatewayBaseUrl }),
    ensAdapter({ rpcUrl: cfg.ethRpcUrl }),
    snsAdapter({ rpcUrl: cfg.solanaRpcUrl }),
    // Stubs (interfaces exist, but not wired yet).
    handshakeAdapterStub(),
    filecoinAdapterStub(),
    arweaveAdapterStub()
  ];
}

export async function resolveRouteAnswer(
  adapters: RouteAdapter[],
  nameOrRef: string,
  opts: AdapterResolveOptions
): Promise<RouteAnswer> {
  for (const adapter of adapters) {
    if (!adapter.supports(nameOrRef)) continue;
    const answer = await adapter.resolve(nameOrRef, opts);
    if (answer) return answer;
  }
  throw new Error("NO_ADAPTER_MATCH");
}


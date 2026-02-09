import type { Adapter } from "./adapter.js";
import type { RouteAnswer } from "./types.js";
import { destHashHex, sha256Hex } from "./types.js";
import { resolveEns, supportsEns } from "../adapters/ens.js";

type EnsAdapterConfig = {
  rpcUrl: string;
};

export function ensAdapter(config: EnsAdapterConfig): Adapter {
  return {
    kind: "ens",
    resolve: async (input) => {
      const name = input?.name ?? "";
      if (!name) return null;
      if (!supportsEns(name)) return null;
      const timeoutMs = Number(input?.opts?.timeoutMs ?? 5000);
      return resolveEnsRoute(name, config, timeoutMs);
    }
  };
}

async function resolveEnsRoute(
  name: string,
  config: EnsAdapterConfig,
  timeoutMs: number
): Promise<RouteAnswer | null> {
  const records = await resolveEns(name, { rpcUrl: config.rpcUrl, timeoutMs });
  if (!records.length) return null;

  // Prefer contenthash if present, otherwise addr.
  const content = records.find((r) => r.type === "CONTENTHASH");
  const addr = records.find((r) => r.type === "ADDR");
  const dest = content
    ? `ens:contenthash:${String(content.value)}`
    : addr
      ? `eip155:1:${String(addr.value)}`
      : `ens:records:${sha256Hex(JSON.stringify(records))}`;

  return {
    name: name.trim().toLowerCase(),
    nameHashHex: sha256Hex(name.trim().toLowerCase()),
    dest,
    destHashHex: destHashHex(dest),
    ttlS: 300,
    source: {
      kind: "ens",
      ref: "eth_call",
      confidenceBps: 8000
    },
    proof: {
      type: "onchain",
      payload: {
        chain: "ethereum",
        rpcUrl: config.rpcUrl ? "<configured>" : "",
        records
      }
    }
  };
}

import type { Adapter } from "./adapter.js";
import type { RouteAnswer } from "./types.js";
import { destHashHex, sha256Hex } from "./types.js";
import { resolveSns, supportsSns } from "../adapters/sns.js";

type SnsAdapterConfig = {
  rpcUrl: string;
};

export function snsAdapter(config: SnsAdapterConfig): Adapter {
  return {
    kind: "sns",
    resolve: async (input) => {
      const name = input?.name ?? "";
      if (!name) return null;
      if (!supportsSns(name)) return null;
      const timeoutMs = Number(input?.opts?.timeoutMs ?? 5000);
      return resolveSnsRoute(name, config, timeoutMs);
    }
  };
}

async function resolveSnsRoute(
  name: string,
  config: SnsAdapterConfig,
  timeoutMs: number
): Promise<RouteAnswer | null> {
  const records = await resolveSns(name, { rpcUrl: config.rpcUrl, timeoutMs });
  if (!records.length) return null;
  const owner = records.find((r) => r.type === "OWNER")?.value;
  if (!owner || typeof owner !== "string") return null;

  const dest = `solana:owner:${owner}`;
  return {
    name: name.trim().toLowerCase(),
    nameHashHex: sha256Hex(name.trim().toLowerCase()),
    dest,
    destHashHex: destHashHex(dest),
    ttlS: 300,
    source: {
      kind: "sns",
      ref: "getAccountInfo",
      confidenceBps: 8000
    },
    proof: {
      type: "onchain",
      payload: {
        chain: "solana",
        rpcUrl: config.rpcUrl ? "<configured>" : "",
        records
      }
    }
  };
}

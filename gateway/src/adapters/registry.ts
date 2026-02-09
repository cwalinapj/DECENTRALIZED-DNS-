import type { RouteAnswer } from "./types.js";
import type { Adapter } from "./shim.js";

export type AdapterRegistry = {
  resolveAuto(input: { name: string; nowUnix?: number; network?: string; opts?: Record<string, any> }): Promise<RouteAnswer>;
  resolveWithSource(input: { name: string; source: RouteAnswer["source"]["kind"]; nowUnix?: number; network?: string; opts?: Record<string, any> }): Promise<RouteAnswer>;
};

export function createAdapterRegistry(adapters: Record<string, Adapter | undefined>): AdapterRegistry {
  const pkdns = must(adapters.pkdns, "pkdns");
  const ipfs = must(adapters.ipfs, "ipfs");
  const ens = must(adapters.ens, "ens");
  const sns = must(adapters.sns, "sns");
  const handshake = adapters.handshake;
  const filecoin = adapters.filecoin;
  const arweave = adapters.arweave;

  const byKind: Record<RouteAnswer["source"]["kind"], Adapter | undefined> = {
    pkdns,
    ipfs,
    ens,
    sns,
    handshake,
    filecoin,
    arweave
  };

  async function enrichContent(answer: RouteAnswer, baseInput: any): Promise<RouteAnswer> {
    if (answer.dest && answer.dest.toLowerCase().startsWith("ipfs://") && answer.source.kind !== "ipfs") {
      const enriched = await ipfs.resolve({ ...baseInput, name: answer.dest });
      if (enriched) {
        return {
          ...answer,
          proof: {
            ...answer.proof,
            payload: {
              ...answer.proof.payload,
              enrichment: {
                ...(answer.proof.payload?.enrichment || {}),
                ipfs: enriched.proof.payload
              }
            }
          }
        };
      }
    }
    return answer;
  }

  return {
    async resolveAuto(input) {
      const name = input?.name ?? "";
      if (!name) throw new Error("missing_name");
      const lowered = name.trim().toLowerCase();

      // Priority rule #1: .dns => PKDNS first.
      if (lowered.endsWith(".dns")) {
        const ans = await pkdns.resolve(input);
        if (!ans) throw new Error("NOT_FOUND");
        return enrichContent(ans, input);
      }

      // Otherwise: choose likely adapter by suffix/protocol.
      const candidates: Adapter[] = [];
      if (lowered.startsWith("ipfs://")) candidates.push(ipfs);
      if (lowered.endsWith(".eth")) candidates.push(ens);
      if (lowered.endsWith(".sol")) candidates.push(sns);
      candidates.push(pkdns, ipfs, ens, sns);

      for (const a of candidates) {
        const ans = await a.resolve(input);
        if (ans) return enrichContent(ans, input);
      }
      throw new Error("NO_ADAPTER_MATCH");
    },

    async resolveWithSource(input) {
      const adapter = byKind[input.source];
      if (!adapter) throw new Error(`UNKNOWN_SOURCE:${input.source}`);
      const ans = await adapter.resolve(input);
      if (!ans) throw new Error("NOT_FOUND");
      return enrichContent(ans, input);
    }
  };
}

function must<T>(v: T | undefined, name: string): T {
  if (!v) throw new Error(`missing_adapter:${name}`);
  return v;
}


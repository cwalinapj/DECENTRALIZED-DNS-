import { Connection, PublicKey } from "@solana/web3.js";
import { getHashedName, getNameAccountKey, NameRegistryState } from "@bonfida/spl-name-service";
import type { ResolveRecord } from "../server.js";
import type { Adapter } from "./shim.js";
import { destHashHex, nameHashHex } from "./types.js";

export type SnsConfig = {
  rpcUrl: string;
  timeoutMs: number;
};

export function supportsSns(name: string): boolean {
  return name.toLowerCase().endsWith(".sol");
}

export async function resolveSns(name: string, config: SnsConfig): Promise<ResolveRecord[]> {
  const trimmed = name.toLowerCase().replace(/\.sol$/, "");
  const connection = new Connection(config.rpcUrl, "confirmed");
  const hashed = await getHashedName(trimmed);
  const nameAccountKey = await getNameAccountKey(hashed, undefined, new PublicKey("namesLPneVptA9Z5JXxK1QX5Qk8i5gGbpGd3uW9oU8s"));

  // Prefer NameRegistryState parsing when possible; fall back to raw account owner.
  try {
    const retrieved: any = await withTimeout(NameRegistryState.retrieve(connection, nameAccountKey), config.timeoutMs);
    if (!retrieved) return [];
    const registry = retrieved.registry ?? retrieved;

    const owner = registry.owner.toBase58();
    const records: ResolveRecord[] = [{ type: "OWNER", value: owner }];

    // MVP: if registry has UTF-8 data and looks like a URL, surface it as TEXT_URL.
    const data = registry.data;
    if (data && data.length) {
      try {
        const s = Buffer.from(data).toString("utf8").trim();
        if (/^https?:\/\//i.test(s)) records.push({ type: "TEXT_URL", value: s });
      } catch {
        // ignore
      }
    }
    return records;
  } catch {
    const accountInfo = await withTimeout(connection.getAccountInfo(nameAccountKey, "confirmed"), config.timeoutMs);
    if (!accountInfo) return [];
    return [{ type: "OWNER", value: accountInfo.owner.toBase58() }];
  }
}

export function createSnsAdapter(params: { rpcUrl: string }): Adapter {
  return {
    kind: "sns",
    async resolve(input) {
      const name = input?.name ?? "";
      if (!name || !supportsSns(name)) return null;

      // MVP: allow mock mode (no external RPC needed).
      if (input?.opts?.mock) {
        const dest = String(input?.opts?.mockDest || "sns:mock");
        return {
          name: name.toLowerCase(),
          nameHashHex: nameHashHex(name.toLowerCase()),
          dest,
          destHashHex: destHashHex(dest),
          ttlS: 300,
          source: { kind: "sns", ref: "mock", confidenceBps: 1000 },
          proof: { type: "none", payload: { mock: true } }
        };
      }

      const rpcUrl = input?.opts?.solanaRpcUrl || params.rpcUrl;
      const timeoutMs = Number(input?.opts?.timeoutMs ?? 5000);
      const records = await resolveSns(name, { rpcUrl, timeoutMs });
      if (!records.length) return null;

      const url = records.find((r) => r.type === "TEXT_URL")?.value;
      const owner = records.find((r) => r.type === "OWNER")?.value;
      const dest = typeof url === "string" ? url : typeof owner === "string" ? `solana:owner:${owner}` : "sns:records";

      return {
        name: name.toLowerCase(),
        nameHashHex: nameHashHex(name.toLowerCase()),
        dest,
        destHashHex: destHashHex(dest),
        ttlS: 300,
        source: { kind: "sns", ref: "getAccountInfo", confidenceBps: 8000 },
        proof: {
          type: "onchain",
          payload: { cluster: input?.network || "unknown", records }
        }
      };
    }
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("SNS_TIMEOUT")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timer]);
  } finally {
    clearTimeout(timeout!);
  }
}

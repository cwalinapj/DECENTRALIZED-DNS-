import { Connection, PublicKey } from "@solana/web3.js";
import { getHashedName, getNameAccountKey } from "@bonfida/spl-name-service";
import type { ResolveRecord } from "../server.js";

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

  const accountInfo = await withTimeout(connection.getAccountInfo(nameAccountKey), config.timeoutMs);
  if (!accountInfo) return [];

  const owner = accountInfo.owner.toBase58();
  return [{ type: "OWNER", value: owner }];
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

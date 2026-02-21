import { Connection, PublicKey } from "@solana/web3.js";
import { getHashedName, getNameAccountKey, NameRegistryState } from "@bonfida/spl-name-service";
import type { ResolveRecord } from "../server.js";
import { selectPreferredTextRecord } from "../hosting/targets.js";
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

    // MVP: parse UTF-8 payload for basic text-record style values.
    const data = registry.data;
    if (data && data.length) {
      const textRecords = extractSnsTextRecords(Buffer.from(data));
      for (const entry of textRecords) {
        records.push({ type: "TEXT", value: entry });
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

      const textEntries = records
        .map((record) => {
          if (record.type !== "TEXT" || typeof record.value === "string") return null;
          return { key: String(record.value.key || ""), value: String(record.value.value || "") };
        })
        .filter((entry): entry is { key: string; value: string } => !!entry);
      const selectedText = selectPreferredTextRecord(textEntries);
      const textTarget = selectedText?.parsed || null;
      const owner = records.find((r) => r.type === "OWNER")?.value;
      const dest = textTarget
        ? textTarget.normalizedDest
        : selectedText
          ? selectedText.rawValue
        : typeof owner === "string"
          ? `solana:owner:${owner}`
          : "sns:records";

      const proofPayload: Record<string, unknown> = {
        adapter: "sns",
        cluster: input?.network || "unknown",
        records
      };
      if (selectedText) {
        proofPayload.record_source = "text";
        proofPayload.record_key = selectedText.key;
        proofPayload.raw_value = selectedText.rawValue;
        proofPayload.parsed_target = textTarget
          ? {
            scheme: textTarget.scheme,
            value: textTarget.value
          }
          : null;
      } else {
        proofPayload.record_source = null;
        proofPayload.record_key = null;
        proofPayload.raw_value = null;
        proofPayload.parsed_target = null;
      }

      return {
        name: name.toLowerCase(),
        nameHashHex: nameHashHex(name.toLowerCase()),
        dest,
        destHashHex: destHashHex(dest),
        ttlS: 300,
        source: { kind: "sns", ref: "getAccountInfo", confidenceBps: 8000 },
        proof: {
          type: "onchain",
          payload: proofPayload
        }
      };
    }
  };
}

function extractSnsTextRecords(data: Buffer): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  const raw = data.toString("utf8").replace(/\0/g, "").trim();
  if (!raw) return out;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value.trim()) {
          out.push({ key: key.toLowerCase(), value: value.trim() });
        }
      }
      if (out.length) return out;
    }
  } catch {
    // ignore
  }

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key && value) out.push({ key, value });
  }
  if (out.length) return out;

  if (/^https?:\/\//i.test(raw) || /^ipfs:\/\//i.test(raw) || /^ar:\/\//i.test(raw)) {
    out.push({ key: "url", value: raw });
  } else if (/^Qm[1-9A-HJ-NP-Za-km-z]{40,}$/.test(raw) || /^bafy[0-9a-z]{20,}$/i.test(raw)) {
    out.push({ key: "content", value: raw });
  } else if (/^[A-Za-z0-9_-]{43,64}$/.test(raw)) {
    out.push({ key: "arweave", value: raw });
  }

  return out;
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

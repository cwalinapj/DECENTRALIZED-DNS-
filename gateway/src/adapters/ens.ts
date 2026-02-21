import { Interface, namehash } from "ethers";
import type { ResolveRecord } from "../server.js";
import {
  decodeEnsContenthash,
  selectPreferredTextRecord
} from "../hosting/targets.js";
import type { Adapter } from "./shim.js";
import type { RouteAnswer } from "./types.js";
import { destHashHex, nameHashHex } from "./types.js";

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const resolverIface = new Interface(["function resolver(bytes32 node) view returns (address)"]);
const addrIface = new Interface(["function addr(bytes32 node) view returns (address)"]);
const contentIface = new Interface(["function contenthash(bytes32 node) view returns (bytes)"]);
const textIface = new Interface(["function text(bytes32 node, string key) view returns (string)"]);
const ENS_TEXT_KEYS = ["content", "ipfs", "arweave", "url"] as const;

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
  const resolverEncoded = await callRpc(config, ENS_REGISTRY, resolverData);
  const [resolverAddressRaw] = resolverIface.decodeFunctionResult("resolver", resolverEncoded);
  const resolverAddress = String(resolverAddressRaw);
  if (!resolverAddress || resolverAddress === "0x0000000000000000000000000000000000000000") {
    return [];
  }

  const records: ResolveRecord[] = [];

  const addrData = addrIface.encodeFunctionData("addr", [node]);
  const addrEncoded = await callRpc(config, resolverAddress, addrData);
  const [addrRaw] = addrIface.decodeFunctionResult("addr", addrEncoded);
  const addr = String(addrRaw);
  if (addr && addr !== "0x0000000000000000000000000000000000000000") {
    records.push({ type: "ADDR", value: addr });
  }

  const contentData = contentIface.encodeFunctionData("contenthash", [node]);
  const contentEncoded = await callRpc(config, resolverAddress, contentData);
  const [contentRaw] = contentIface.decodeFunctionResult("contenthash", contentEncoded);
  const content = String(contentRaw);
  if (content && content !== "0x" && content !== "0X") {
    records.push({ type: "CONTENTHASH", value: content.toLowerCase() });
  }

  for (const key of ENS_TEXT_KEYS) {
    try {
      const textData = textIface.encodeFunctionData("text", [node, key]);
      const textResult = await callRpc(config, resolverAddress, textData);
      const decoded = textIface.decodeFunctionResult("text", textResult);
      const value = decoded?.[0] ? String(decoded[0]).trim() : "";
      if (!value) continue;
      records.push({ type: "TEXT", value: { key, value } });
    } catch {
      // ignore optional text keys
    }
  }

  return records;
}

export function createEnsAdapter(params: { rpcUrl: string; chainId?: number }): Adapter {
  return {
    kind: "ens",
    async resolve(input) {
      const name = input?.name ?? "";
      if (!name || !supportsEns(name)) return null;
      const timeoutMs = Number(input?.opts?.timeoutMs ?? 5000);
      const rpcUrl = input?.opts?.evmRpcUrl || params.rpcUrl;
      if (!rpcUrl) return null;

      // MVP: allow mock mode (no external RPC needed).
      if (input?.opts?.mock) {
        const dest = String(input?.opts?.mockDest || "ens:mock");
        return {
          name: name.toLowerCase(),
          nameHashHex: nameHashHex(name.toLowerCase()),
          dest,
          destHashHex: destHashHex(dest),
          ttlS: 300,
          source: { kind: "ens", ref: "mock", confidenceBps: 1000 },
          proof: { type: "none", payload: { mock: true } }
        };
      }

      const records = await resolveEns(name, { rpcUrl, timeoutMs });
      if (!records.length) return null;

      const content = records.find((r) => r.type === "CONTENTHASH");
      const textEntries = records
        .map((record) => {
          if (record.type !== "TEXT" || typeof record.value === "string") return null;
          return { key: String(record.value.key || ""), value: String(record.value.value || "") };
        })
        .filter((entry): entry is { key: string; value: string } => !!entry);
      const selectedText = selectPreferredTextRecord(textEntries);
      const textTarget = selectedText?.parsed || null;
      const addr = records.find((r) => r.type === "ADDR");
      const contentTarget = content ? decodeEnsContenthash(String(content.value)) : null;
      const target = contentTarget || textTarget;
      const dest = target
        ? target.normalizedDest
        : selectedText
          ? selectedText.rawValue
        : addr
          ? `eip155:${params.chainId ?? input?.opts?.chainId ?? 1}:${String(addr.value)}`
          : `ens:records`;

      const proofPayload: Record<string, unknown> = {
        adapter: "ens",
        chainId: params.chainId ?? input?.opts?.chainId ?? 1,
        rpc: "<configured>",
        records
      };

      if (contentTarget && content) {
        proofPayload.record_source = "contenthash";
        proofPayload.raw_value = String(content.value);
        proofPayload.parsed_target = { scheme: contentTarget.scheme, value: contentTarget.value };
      } else if (selectedText) {
        proofPayload.record_source = "text";
        proofPayload.record_key = selectedText.key;
        proofPayload.raw_value = selectedText.rawValue;
        proofPayload.parsed_target = textTarget
          ? { scheme: textTarget.scheme, value: textTarget.value }
          : null;
      } else {
        proofPayload.record_source = null;
        proofPayload.raw_value = null;
        proofPayload.parsed_target = null;
      }

      return {
        name: name.toLowerCase(),
        nameHashHex: nameHashHex(name.toLowerCase()),
        dest,
        destHashHex: destHashHex(dest),
        ttlS: 300,
        source: { kind: "ens", ref: "eth_call", confidenceBps: 8000 },
        proof: {
          type: "onchain",
          payload: proofPayload
        }
      };
    }
  };
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

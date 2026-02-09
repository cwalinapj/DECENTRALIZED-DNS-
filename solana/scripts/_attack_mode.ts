import { fetchAccountMultiRpc, policyForMode, AttackMode } from "@ddns/attack-mode";

export type MultiRpcGuardResult =
  | { ok: true; agreeingUrls: string[]; slot: number; dataHashHex: string }
  | { ok: false; mode: AttackMode; reasons: string[]; evidence: any };

export function parseRpcQuorumUrls(rpcUrl: string): string[] {
  const extra = (process.env.RPC_QUORUM_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const urls = [rpcUrl, ...extra];
  // de-dupe while preserving order
  const seen = new Set<string>();
  return urls.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

export async function guardWriteWithMultiRpc(params: {
  account: string;         // base58 pubkey
  rpcUrls: string[];
  nowUnix?: number;
}): Promise<MultiRpcGuardResult> {
  if (process.env.ATTACK_MODE_ENABLED !== "1") {
    return { ok: true, agreeingUrls: [params.rpcUrls[0] || ""].filter(Boolean), slot: 0, dataHashHex: "0x" + "00".repeat(32) };
  }

  // If quorum urls not configured, don't block writes (MVP).
  if (!params.rpcUrls || params.rpcUrls.length < 2) {
    return { ok: true, agreeingUrls: params.rpcUrls || [], slot: 0, dataHashHex: "0x" + "00".repeat(32) };
  }

  // In suspicious modes we require >=2 agreeing RPCs. If any disagreement is observed, fail closed for writes.
  const policy = policyForMode(AttackMode.SUSPICIOUS);
  const result = await fetchAccountMultiRpc({
    account: params.account,
    rpcUrls: params.rpcUrls,
    minAgree: policy.minRpcQuorum,
    commitment: "confirmed",
    timeoutMs: Number(process.env.ATTACK_RPC_TIMEOUT_MS || "5000")
  });

  if (!result.ok) {
    const mode = result.disagreement ? AttackMode.ISOLATED : AttackMode.SUSPICIOUS;
    const reasons = result.disagreement ? ["rpc_disagreement"] : ["rpc_quorum_failed"];
    return { ok: false, mode, reasons, evidence: result.evidence };
  }
  return { ok: true, agreeingUrls: result.agreeingUrls, slot: result.slot, dataHashHex: result.dataHashHex };
}


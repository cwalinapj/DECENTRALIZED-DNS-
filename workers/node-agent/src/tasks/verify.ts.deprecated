import type { ReceiptCore } from "../../../../ddns-core/credits/types.d.ts";
import { computeReceiptId, signReceipt } from "../../../../ddns-core/credits/receipts.js";

export async function createReceipt(privKeyHex: string, core: Omit<ReceiptCore, "id">) {
  const id = computeReceiptId(core);
  const receipt: ReceiptCore = { ...core, id } as ReceiptCore;
  const signature = await signReceipt(privKeyHex, receipt);
  return { ...receipt, signature };
}

export function canServeTor(): boolean {
  return process.env.ALLOW_TOR === "1";
}

export function canProxyChain(): boolean {
  return process.env.ALLOW_PROXY_CHAIN === "1";
}

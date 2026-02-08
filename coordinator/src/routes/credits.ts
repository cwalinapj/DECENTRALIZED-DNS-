import type { CreditsState } from "./receipts.js";

export function getBalance(state: CreditsState, wallet: string) {
  return state.credits.get(wallet) || 0;
}

export function spendCredits(state: CreditsState, wallet: string, amount: number) {
  const current = state.credits.get(wallet) || 0;
  if (current < amount) return { ok: false, error: "INSUFFICIENT_CREDITS" };
  state.credits.set(wallet, current - amount);
  return { ok: true };
}

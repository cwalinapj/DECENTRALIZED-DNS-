import type { SettlementRecord } from "./types.js";

export class SpendEscrowMemory {
  private balances = new Map<string, bigint>();
  private spendLimits = new Map<string, bigint>();
  private settlers = new Set<string>();
  private settlements: SettlementRecord[] = [];

  setSettler(address: string, allowed: boolean) {
    if (allowed) this.settlers.add(address);
    else this.settlers.delete(address);
  }

  deposit(user: string, amount: bigint) {
    if (amount <= 0n) throw new Error("invalid_amount");
    const current = this.balances.get(user) || 0n;
    this.balances.set(user, current + amount);
  }

  withdraw(user: string, amount: bigint) {
    if (amount <= 0n) throw new Error("invalid_amount");
    const current = this.balances.get(user) || 0n;
    if (current < amount) throw new Error("insufficient_balance");
    this.balances.set(user, current - amount);
  }

  setSpendLimit(user: string, limit: bigint) {
    if (limit < 0n) throw new Error("invalid_limit");
    this.spendLimits.set(user, limit);
  }

  balanceOf(user: string): bigint {
    return this.balances.get(user) || 0n;
  }

  debitForSettlement(settler: string, user: string, amount: bigint, settlementId: string) {
    if (!this.settlers.has(settler)) throw new Error("not_settler");
    if (amount <= 0n) throw new Error("invalid_amount");
    const current = this.balances.get(user) || 0n;
    if (current < amount) throw new Error("insufficient_balance");
    const limit = this.spendLimits.get(user) || 0n;
    if (limit > 0n && amount > limit) throw new Error("spend_limit_exceeded");
    this.balances.set(user, current - amount);
    const record: SettlementRecord = {
      settlement_id: settlementId,
      user,
      amount: amount.toString(),
      created_at: new Date().toISOString()
    };
    this.settlements.push(record);
    return record;
  }

  listSettlements(): SettlementRecord[] {
    return [...this.settlements];
  }
}

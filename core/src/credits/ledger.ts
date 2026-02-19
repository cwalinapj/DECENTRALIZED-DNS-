import fs from "node:fs";
import path from "node:path";

export type CreditsLedgerEntry = {
  domain_or_owner: string;
  amount: number;
  reason: string;
  ts: string;
  kind: "credit" | "debit";
};

export type CreditsLedgerStore = {
  balances: Record<string, number>;
  entries: CreditsLedgerEntry[];
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function defaultStore(): CreditsLedgerStore {
  return {
    balances: {
      "good-traffic.com": 180,
      "low-traffic.com": 20,
      "active.com": 75
    },
    entries: []
  };
}

function ensureStore(filePath: string): CreditsLedgerStore {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const seeded = defaultStore();
    fs.writeFileSync(filePath, JSON.stringify(seeded, null, 2) + "\n", "utf8");
    return seeded;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as CreditsLedgerStore;
  if (!parsed.balances || typeof parsed.balances !== "object") return defaultStore();
  if (!Array.isArray(parsed.entries)) parsed.entries = [];
  return parsed;
}

function saveStore(filePath: string, store: CreditsLedgerStore): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function createCreditsLedger(filePath = path.resolve(process.cwd(), "gateway/.cache/credits_ledger.json")) {
  return {
    getBalance(domainOrOwner: string): number {
      const key = normalizeKey(domainOrOwner);
      if (!key) return 0;
      const store = ensureStore(filePath);
      return Number(store.balances[key] || 0);
    },

    credit(domainOrOwner: string, amount: number, reason: string): number {
      const key = normalizeKey(domainOrOwner);
      if (!key) throw new Error("invalid_key");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");
      const store = ensureStore(filePath);
      store.balances[key] = Number(store.balances[key] || 0) + amount;
      store.entries.push({ domain_or_owner: key, amount, reason: reason || "credit", ts: new Date().toISOString(), kind: "credit" });
      saveStore(filePath, store);
      return store.balances[key];
    },

    debit(domainOrOwner: string, amount: number, reason: string): number {
      const key = normalizeKey(domainOrOwner);
      if (!key) throw new Error("invalid_key");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");
      const store = ensureStore(filePath);
      const current = Number(store.balances[key] || 0);
      if (current < amount) throw new Error("insufficient_credits");
      store.balances[key] = current - amount;
      store.entries.push({ domain_or_owner: key, amount, reason: reason || "debit", ts: new Date().toISOString(), kind: "debit" });
      saveStore(filePath, store);
      return store.balances[key];
    },

    estimateRenewalSubsidy(domain: string): { credits_balance: number; renewal_cost_estimate: number; covered_by_credits: boolean; covered_amount: number } {
      const credits = this.getBalance(domain);
      const renewalCostEstimate = 110; // 11 USD-equivalent in credits for MVP mock.
      const coveredAmount = Math.min(renewalCostEstimate, credits);
      return {
        credits_balance: credits,
        renewal_cost_estimate: renewalCostEstimate,
        covered_by_credits: coveredAmount >= renewalCostEstimate,
        covered_amount: coveredAmount
      };
    }
  };
}

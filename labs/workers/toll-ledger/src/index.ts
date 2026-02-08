type LedgerEntry = {
  wallet_id: string;
  credits: number;
  last_updated: string;
};

type LedgerEvent = {
  wallet_id: string;
  type: "burn" | "faucet" | "debit";
  amount: number;
  timestamp: string;
  feature?: string;
};

function applyEvent(entry: LedgerEntry, event: LedgerEvent): LedgerEntry {
  const next = { ...entry };
  if (event.type === "burn" || event.type === "faucet") {
    next.credits += event.amount;
  } else if (event.type === "debit") {
    next.credits = Math.max(0, next.credits - event.amount);
  }
  next.last_updated = event.timestamp;
  return next;
}

function main() {
  const entry: LedgerEntry = { wallet_id: "wallet-1", credits: 0, last_updated: new Date().toISOString() };
  const events: LedgerEvent[] = [
    { wallet_id: "wallet-1", type: "burn", amount: 100, timestamp: new Date().toISOString(), feature: "native_burn" },
    { wallet_id: "wallet-1", type: "debit", amount: 1, timestamp: new Date().toISOString(), feature: "dns_query" }
  ];
  const updated = events.reduce(applyEvent, entry);
  process.stdout.write(JSON.stringify(updated, null, 2));
}

main();

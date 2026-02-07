type TrustEvent = {
  wallet_id: string;
  type: string;
  ok: boolean;
  timestamp: string;
};

type TrustScore = {
  wallet_id: string;
  trust_tier: string;
  score_band: string;
  last_verified_at: string;
  miner_class: string;
};

function scoreFromEvents(events: TrustEvent[]): TrustScore {
  const okCount = events.filter((event) => event.ok).length;
  const total = events.length || 1;
  const ratio = okCount / total;
  const score = Math.round(500 + ratio * 300);
  const band = `${Math.floor(score / 50) * 50}-${Math.floor(score / 50) * 50 + 49}`;
  return {
    wallet_id: events[0]?.wallet_id || "unknown",
    trust_tier: ratio > 0.9 ? "gold" : ratio > 0.75 ? "silver" : "bronze",
    score_band: band,
    last_verified_at: new Date().toISOString(),
    miner_class: "raspi"
  };
}

function main() {
  const example: TrustEvent[] = [
    { wallet_id: "wallet-1", type: "voucher", ok: true, timestamp: new Date().toISOString() },
    { wallet_id: "wallet-1", type: "receipt", ok: true, timestamp: new Date().toISOString() }
  ];
  const score = scoreFromEvents(example);
  process.stdout.write(JSON.stringify(score, null, 2));
}

main();

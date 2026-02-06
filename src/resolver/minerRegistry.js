const DEFAULT_ERROR_RATE_LIMIT = 0.2;
const DEFAULT_LATENCY_MS = 150;
const MAX_TOP_CANDIDATES = 5;

const normalizeMiner = (miner) => ({
  successRate: 0.9,
  capacityScore: 0.5,
  errorRate: 0,
  status: 'active',
  ...miner,
});

const scoreMiner = (miner) => {
  const latencyValue =
    Number.isFinite(miner.latencyMs) && miner.latencyMs > 0
      ? miner.latencyMs
      : DEFAULT_LATENCY_MS;
  const latencyScore = 1 / Math.max(1, latencyValue);
  const reliabilityScore = Math.max(0, Math.min(1, miner.successRate ?? 0.9));
  const capacityScore = Math.max(0, Math.min(1, miner.capacityScore ?? 0.5));
  return latencyScore * 100 + reliabilityScore * 50 + capacityScore * 30;
};

const pickWeighted = (candidates, randomFn) => {
  const total = candidates.reduce((sum, candidate) => sum + candidate.score, 0);
  if (total <= 0) {
    return candidates[0]?.miner || null;
  }

  let threshold = randomFn() * total;
  for (const candidate of candidates) {
    threshold -= candidate.score;
    if (threshold <= 0) {
      return candidate.miner;
    }
  }

  return candidates[candidates.length - 1]?.miner || null;
};

const createMinerRegistry = (seedMiners = [], options = {}) => {
  const randomFn = options.randomFn || Math.random;
  const errorRateLimit = Number.isFinite(options.errorRateLimit)
    ? options.errorRateLimit
    : DEFAULT_ERROR_RATE_LIMIT;
  const miners = new Map();

  const registerMiner = (miner) => {
    const normalized = normalizeMiner(miner);
    miners.set(normalized.id, normalized);
  };

  seedMiners.forEach(registerMiner);

  const listMiners = () => Array.from(miners.values());

  const selectMiner = ({ region, capability, excludedProviders = [] }) => {
    const candidates = listMiners()
      .filter((miner) => miner.status === 'active')
      .filter((miner) => !capability || miner.capabilities.includes(capability))
      .filter((miner) => !region || miner.region === region)
      .filter((miner) => miner.errorRate <= errorRateLimit)
      .filter((miner) => !excludedProviders.includes(miner.provider))
      .map((miner) => ({ miner, score: scoreMiner(miner) }));

    if (!candidates.length) {
      return null;
    }

    const topCandidates = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TOP_CANDIDATES);

    return pickWeighted(topCandidates, randomFn);
  };

  return {
    registerMiner,
    listMiners,
    selectMiner,
  };
};

module.exports = { createMinerRegistry, scoreMiner };

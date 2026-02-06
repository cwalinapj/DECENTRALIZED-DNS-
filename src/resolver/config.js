const config = {
  port: process.env.TOLLDNS_RESOLVER_PORT
    ? Number(process.env.TOLLDNS_RESOLVER_PORT)
    : 8787,
  resolverId: process.env.TOLLDNS_RESOLVER_ID || 'resolver-local',
  upstreamResolvers: [
    'https://dns.google/dns-query',
    'https://cloudflare-dns.com/dns-query',
  ],
  settlementWindowMs: 60 * 60 * 1000,
  defaultRegion: 'NA-EAST',
  miners: [
    {
      id: 'miner-na-east-1',
      region: 'NA-EAST',
      capabilities: ['gateway', 'cache'],
      latencyMs: 45,
      successRate: 0.98,
      capacityScore: 0.9,
      provider: 'example-asn-1',
      status: 'active',
    },
    {
      id: 'miner-eu-west-1',
      region: 'EU-WEST',
      capabilities: ['gateway'],
      latencyMs: 92,
      successRate: 0.96,
      capacityScore: 0.8,
      provider: 'example-asn-2',
      status: 'active',
    },
    {
      id: 'miner-apac-1',
      region: 'APAC',
      capabilities: ['gateway', 'cache'],
      latencyMs: 120,
      successRate: 0.94,
      capacityScore: 0.7,
      provider: 'example-asn-3',
      status: 'active',
    },
  ],
};

module.exports = { config };

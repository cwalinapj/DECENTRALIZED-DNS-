const test = require('node:test');
const assert = require('node:assert/strict');

const { createWallet } = require('../src/client-stub/wallet');
const { validateVoucherFields } = require('../src/shared/voucher');
const { createVoucherLedger } = require('../src/resolver/voucherLedger');
const { createMinerRegistry } = require('../src/resolver/minerRegistry');

const VOUCHER_EXPIRY_MS = 60000;

test('validates voucher signatures and sequence numbers', () => {
  const wallet = createWallet();
  const voucher = wallet.createVoucher({
    resolverId: 'resolver-local',
    amount: 0.5,
    expiry: Date.now() + VOUCHER_EXPIRY_MS,
    queryCommitment: 'commitment',
  });

  const validation = validateVoucherFields(voucher);
  assert.equal(validation.ok, true);

  const ledger = createVoucherLedger();
  assert.equal(ledger.verifySequence(voucher).ok, true);
  ledger.recordVoucher(voucher);
  assert.equal(ledger.verifySequence(voucher).ok, false);
});

test('selects a miner based on region and capability', () => {
  const registry = createMinerRegistry(
    [
      {
        id: 'miner-fast',
        region: 'NA-EAST',
        capabilities: ['gateway'],
        latencyMs: 25,
        successRate: 0.99,
        capacityScore: 0.9,
        provider: 'asn-1',
        status: 'active',
      },
      {
        id: 'miner-slow',
        region: 'NA-EAST',
        capabilities: ['gateway'],
        latencyMs: 120,
        successRate: 0.9,
        capacityScore: 0.6,
        provider: 'asn-2',
        status: 'active',
      },
    ],
    { randomFn: () => 0 }
  );

  const miner = registry.selectMiner({ region: 'NA-EAST', capability: 'gateway' });
  assert.equal(miner.id, 'miner-fast');
});

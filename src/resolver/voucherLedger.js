const buildLedgerKey = (voucher) => `${voucher.resolverId}::${voucher.userPubKey}`;

const createVoucherLedger = () => {
  const lastSeq = new Map();

  const verifySequence = (voucher) => {
    const key = buildLedgerKey(voucher);
    const previous = lastSeq.get(key);
    if (previous !== undefined && voucher.seq <= previous) {
      return { ok: false, reason: 'sequence replay' };
    }
    return { ok: true };
  };

  const recordVoucher = (voucher) => {
    const key = buildLedgerKey(voucher);
    lastSeq.set(key, voucher.seq);
  };

  return {
    verifySequence,
    recordVoucher,
  };
};

module.exports = { createVoucherLedger };

const crypto = require('crypto');
const { signVoucher } = require('../shared/voucher');

const exportPublicKey = (publicKey) =>
  publicKey.export({ type: 'spki', format: 'pem' });

const createWallet = (options = {}) => {
  const keyPair =
    options.keyPair ||
    crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKey = exportPublicKey(keyPair.publicKey);
  const sequences = new Map();

  const nextSeq = (resolverId) => {
    const current = sequences.get(resolverId) || 0;
    const next = current + 1;
    sequences.set(resolverId, next);
    return next;
  };

  const createVoucher = ({
    resolverId,
    amount,
    expiry,
    policyId,
    queryCommitment,
  }) => {
    const voucher = {
      userPubKey: publicKey,
      resolverId,
      amount,
      seq: nextSeq(resolverId),
      expiry,
      policyId,
      queryCommitment,
      issuedAt: Date.now(),
    };

    voucher.sig = signVoucher(voucher, keyPair.privateKey);
    return voucher;
  };

  return {
    publicKey,
    createVoucher,
  };
};

module.exports = { createWallet };

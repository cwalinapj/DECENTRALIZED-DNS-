const crypto = require('crypto');

const REQUIRED_FIELDS = ['userPubKey', 'resolverId', 'amount', 'seq', 'expiry'];

const serializeVoucherPayload = (voucher) => {
  const payload = {
    userPubKey: voucher.userPubKey,
    resolverId: voucher.resolverId,
    amount: voucher.amount,
    seq: voucher.seq,
    expiry: voucher.expiry,
    policyId: voucher.policyId ?? null,
    queryCommitment: voucher.queryCommitment ?? null,
    issuedAt: voucher.issuedAt ?? null,
  };

  return JSON.stringify(payload);
};

const signVoucher = (voucher, privateKey) => {
  const signer = crypto.createSign('SHA256');
  signer.update(serializeVoucherPayload(voucher));
  signer.end();
  return signer.sign(privateKey, 'base64');
};

const verifyVoucherSignature = (voucher) => {
  if (!voucher.sig || !voucher.userPubKey) {
    return false;
  }

  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(serializeVoucherPayload(voucher));
    verifier.end();
    return verifier.verify(voucher.userPubKey, voucher.sig, 'base64');
  } catch (error) {
    return false;
  }
};

const validateVoucherFields = (voucher, now = Date.now()) => {
  if (!voucher || typeof voucher !== 'object') {
    return { ok: false, reason: 'missing voucher' };
  }

  for (const field of REQUIRED_FIELDS) {
    if (voucher[field] === undefined || voucher[field] === null) {
      return { ok: false, reason: `missing ${field}` };
    }
  }

  if (!Number.isFinite(voucher.amount) || voucher.amount <= 0) {
    return { ok: false, reason: 'invalid amount' };
  }

  if (!Number.isInteger(voucher.seq) || voucher.seq < 0) {
    return { ok: false, reason: 'invalid seq' };
  }

  if (!Number.isFinite(voucher.expiry) || voucher.expiry <= now) {
    return { ok: false, reason: 'voucher expired' };
  }

  if (!verifyVoucherSignature(voucher)) {
    return { ok: false, reason: 'invalid signature' };
  }

  return { ok: true };
};

module.exports = {
  serializeVoucherPayload,
  signVoucher,
  validateVoucherFields,
  verifyVoucherSignature,
};

export type VoucherScope = {
  max_amount: string; // integer (Index Units)
  exp: number; // unix seconds
  resolver?: string; // optional resolver/operator id
};

export type VoucherPayload = {
  user: string;
  nonce: string;
  scope: VoucherScope;
};

export type SignedVoucher = {
  payload: VoucherPayload;
  signature: string; // HMAC or ECDSA signature
};

export type SettlementRecord = {
  settlement_id: string;
  user: string;
  amount: string;
  created_at: string;
};

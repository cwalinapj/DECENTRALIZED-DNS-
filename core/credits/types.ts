export type ReceiptType = "SERVE" | "VERIFY" | "STORE";

export type ReceiptRequest = {
  name: string;
};

export type Receipt = {
  type: ReceiptType;
  node_id: string; // base64(pubkey)
  ts: number; // unix seconds
  request?: ReceiptRequest;
  result_hash?: string; // base64(blake3)
  bytes?: number;
  details?: Record<string, unknown>;
};

export type ReceiptEnvelope = {
  receipt: Receipt;
  signature: string; // base64(ed25519 sig)
  public_key: string; // base64(pubkey)
};

export type ReceiptValidationError =
  | "INVALID_SIGNATURE"
  | "MISSING_FIELDS"
  | "UNKNOWN_TYPE"
  | "NODE_ID_MISMATCH";

export type CreditsErrorCode =
  | "NOT_AUTHENTICATED"
  | "PASSPORT_REQUIRED"
  | "NOT_FOUND"
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMITED"
  | "AUTHORITY_SIG_REQUIRED"
  | "AUTHORITY_SIG_INVALID"
  | "CHALLENGE_INVALID";

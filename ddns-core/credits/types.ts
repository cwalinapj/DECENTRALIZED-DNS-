export type ReceiptType = "SERVE" | "VERIFY" | "STORE";

export type ReceiptPayload = {
  name?: string;
  responseHash?: string;
  authoritySig?: string;
  challengeId?: string;
  chunkHash?: string;
  responseHashVerified?: string;
  details?: Record<string, unknown>;
};

export type ReceiptCore = {
  id: string;
  type: ReceiptType;
  wallet: string;
  timestamp: string;
  payload: ReceiptPayload;
};

export type Receipt = ReceiptCore & {
  signature: string;
};

export type ReceiptValidationError =
  | "INVALID_SIGNATURE"
  | "MISSING_FIELDS"
  | "UNKNOWN_TYPE";

export type CreditsErrorCode =
  | "NOT_AUTHENTICATED"
  | "PASSPORT_REQUIRED"
  | "NOT_FOUND"
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMITED"
  | "AUTHORITY_SIG_REQUIRED"
  | "AUTHORITY_SIG_INVALID"
  | "CHALLENGE_INVALID";

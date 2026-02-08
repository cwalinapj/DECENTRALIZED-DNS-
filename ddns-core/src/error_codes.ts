export const ResolveErrorCodes = {
  MISSING_NAME: "missing_name",
  UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  VOUCHER_REQUIRED: "VOUCHER_REQUIRED",
  VOUCHER_INVALID: "VOUCHER_INVALID",
  VOUCHER_NOT_IMPLEMENTED: "VOUCHER_NOT_IMPLEMENTED"
} as const;

export type ResolveErrorCode = typeof ResolveErrorCodes[keyof typeof ResolveErrorCodes];

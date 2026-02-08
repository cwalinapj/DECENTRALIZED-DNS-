import crypto from "node:crypto";

type VoucherScope = {
  max_amount: string;
  exp: number;
  resolver?: string;
};

type VoucherPayload = {
  user: string;
  nonce: string;
  scope: VoucherScope;
};

type SignedVoucher = {
  payload: VoucherPayload;
  signature: string;
};

type VoucherResult = {
  ok: boolean;
  code?: "VOUCHER_REQUIRED" | "VOUCHER_INVALID" | "VOUCHER_NOT_IMPLEMENTED";
  message?: string;
  retryable?: boolean;
};

const VOUCHER_MODE = process.env.VOUCHER_MODE || "stub";
const VOUCHER_SECRET = process.env.VOUCHER_SECRET || "";

export function verifyVoucherHeader(headerValue: string): VoucherResult {
  if (!headerValue) {
    return { ok: false, code: "VOUCHER_REQUIRED", message: "voucher required", retryable: true };
  }

  if (VOUCHER_MODE !== "memory") {
    return {
      ok: false,
      code: "VOUCHER_NOT_IMPLEMENTED",
      message: "voucher verification not yet wired",
      retryable: false
    };
  }

  if (!VOUCHER_SECRET) {
    return {
      ok: false,
      code: "VOUCHER_NOT_IMPLEMENTED",
      message: "VOUCHER_SECRET not configured",
      retryable: false
    };
  }

  let voucher: SignedVoucher;
  try {
    voucher = JSON.parse(headerValue) as SignedVoucher;
  } catch {
    return { ok: false, code: "VOUCHER_INVALID", message: "invalid voucher json", retryable: false };
  }

  if (!voucher?.payload || !voucher?.signature) {
    return { ok: false, code: "VOUCHER_INVALID", message: "missing voucher fields", retryable: false };
  }

  const body = JSON.stringify(voucher.payload);
  const expected = crypto.createHmac("sha256", VOUCHER_SECRET).update(body).digest("hex");
  if (expected !== voucher.signature) {
    return { ok: false, code: "VOUCHER_INVALID", message: "bad signature", retryable: false };
  }

  const now = Math.floor(Date.now() / 1000);
  if (voucher.payload.scope?.exp && now > voucher.payload.scope.exp) {
    return { ok: false, code: "VOUCHER_INVALID", message: "voucher expired", retryable: false };
  }

  return { ok: true };
}

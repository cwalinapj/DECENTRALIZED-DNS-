import crypto from "node:crypto";
import type { SignedVoucher, VoucherPayload } from "./types.js";

export type VoucherVerifierOptions = {
  secret: string;
};

export class VoucherVerifierMemory {
  private lastNonce = new Map<string, bigint>();
  private used = new Set<string>();
  private secret: Buffer;

  constructor(opts: VoucherVerifierOptions) {
    if (!opts.secret) throw new Error("secret_required");
    this.secret = Buffer.from(opts.secret, "utf8");
  }

  sign(payload: VoucherPayload): SignedVoucher {
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", this.secret).update(body).digest("hex");
    return { payload, signature };
  }

  verify(voucher: SignedVoucher): { ok: boolean; reason?: string } {
    const body = JSON.stringify(voucher.payload);
    const expected = crypto.createHmac("sha256", this.secret).update(body).digest("hex");
    if (voucher.signature !== expected) return { ok: false, reason: "bad_signature" };
    const user = voucher.payload.user;
    const nonce = BigInt(voucher.payload.nonce);
    const last = this.lastNonce.get(user) || 0n;
    if (nonce <= last) return { ok: false, reason: "nonce" };
    const voucherId = this.voucherId(voucher.payload);
    if (this.used.has(voucherId)) return { ok: false, reason: "replay" };
    const now = Math.floor(Date.now() / 1000);
    if (voucher.payload.scope.exp && now > voucher.payload.scope.exp) return { ok: false, reason: "expired" };

    this.lastNonce.set(user, nonce);
    this.used.add(voucherId);
    return { ok: true };
  }

  voucherId(payload: VoucherPayload): string {
    return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }
}

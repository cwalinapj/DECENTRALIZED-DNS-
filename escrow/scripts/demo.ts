import { SpendEscrowMemory } from "../src/escrow.js";
import { VoucherVerifierMemory } from "../src/vouchers.js";

const secret = process.env.VOUCHER_HMAC_SECRET || "dev-secret";
const escrow = new SpendEscrowMemory();
const verifier = new VoucherVerifierMemory({ secret });

const user = "user1";
const settler = "resolver1";

escrow.setSettler(settler, true);

escrow.deposit(user, 1_000n);
console.log("balance", escrow.balanceOf(user).toString());

const payload = {
  user,
  nonce: "1",
  scope: { max_amount: "100", exp: Math.floor(Date.now() / 1000) + 3600 }
};
const voucher = verifier.sign(payload);
console.log("voucher", voucher);
console.log("verify", verifier.verify(voucher));

const settlement = escrow.debitForSettlement(settler, user, 100n, "settlement-1");
console.log("settlement", settlement);
console.log("balance", escrow.balanceOf(user).toString());

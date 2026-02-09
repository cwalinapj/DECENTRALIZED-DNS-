import fs from "node:fs";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { PublicKey, Connection } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  encodeVoucherV1,
  nameHashFromDnsName,
  parseHash32Hex,
  voucherMessage,
  loadKeypair,
} from "./escrow_utils.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("payer", { type: "string", demandOption: true })
    .option("name", { type: "string", demandOption: true, describe: "example.dns" })
    .option("amount", { type: "string", demandOption: true, describe: "Amount in base units (u64)" })
    .option("mint", { type: "string", demandOption: true })
    .option("nonce", { type: "string", demandOption: true })
    .option("valid-after-slot", { type: "string", default: "0" })
    .option("expires-at-slot", { type: "string", describe: "Defaults to current_slot+200000" })
    .option("context-hash", { type: "string", describe: "32-byte hex; default random" })
    .option("signer-keypair", { type: "string", describe: "Defaults to ANCHOR_WALLET" })
    .option("rpc", { type: "string", default: process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com" })
    .option("out", { type: "string", describe: "Write JSON to file" })
    .strict()
    .parse();

  const payer = new PublicKey(argv.payer);
  const mint = new PublicKey(argv.mint);
  const amount = BigInt(argv.amount);
  const nonce = BigInt(argv.nonce);
  const validAfterSlot = BigInt(argv["valid-after-slot"]);

  const connection = new Connection(argv.rpc, "confirmed");
  const currentSlot = await connection.getSlot("confirmed");
  const expiresAtSlot =
    argv["expires-at-slot"] !== undefined
      ? BigInt(argv["expires-at-slot"])
      : BigInt(currentSlot + 200_000);

  const nameHash = nameHashFromDnsName(argv.name);
  const contextHash =
    argv["context-hash"] !== undefined
      ? parseHash32Hex(argv["context-hash"])
      : crypto.randomBytes(32);

  const signerPath = argv["signer-keypair"] || process.env.ANCHOR_WALLET;
  if (!signerPath) throw new Error("need --signer-keypair or ANCHOR_WALLET");
  const signer = loadKeypair(signerPath);

  const voucherBytes = encodeVoucherV1({
    payer,
    nameHash,
    amount,
    mint,
    nonce,
    validAfterSlot,
    expiresAtSlot,
    contextHash,
  });
  const msg = voucherMessage(voucherBytes);
  const sig = nacl.sign.detached(new Uint8Array(msg), signer.secretKey);

  const out = {
    voucher_base64: voucherBytes.toString("base64"),
    signature_base64: Buffer.from(sig).toString("base64"),
    signer_pubkey: signer.publicKey.toBase58(),
    message_sha256_hex: Buffer.from(msg).toString("hex"),
    fields: {
      payer: payer.toBase58(),
      name: argv.name,
      name_hash_hex: nameHash.toString("hex"),
      amount: amount.toString(),
      mint: mint.toBase58(),
      nonce: nonce.toString(),
      valid_after_slot: validAfterSlot.toString(),
      expires_at_slot: expiresAtSlot.toString(),
      context_hash_hex: contextHash.toString("hex"),
    },
  };

  if (argv.out) {
    fs.writeFileSync(argv.out, JSON.stringify(out, null, 2));
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


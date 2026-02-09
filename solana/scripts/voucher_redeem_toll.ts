import fs from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import {
  Ed25519Program,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import BN from "bn.js";
import {
  anchorProviderFromEnv,
  decodeVoucherV1,
  loadIdl,
  readProgramIdFromAnchorToml,
  sha256,
  voucherMessage,
  u64ToLe,
} from "./escrow_utils.js";

function readVoucherBytes(input: string): Buffer {
  if (fs.existsSync(input)) {
    const json = JSON.parse(fs.readFileSync(input, "utf8"));
    if (typeof json.voucher_base64 === "string") {
      return Buffer.from(json.voucher_base64, "base64");
    }
    throw new Error("voucher file must contain voucher_base64");
  }
  // assume base64
  return Buffer.from(input, "base64");
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("voucher", { type: "string", demandOption: true, describe: "Path to JSON or base64 voucher bytes" })
    .option("sig", { type: "string", demandOption: true, describe: "base64 signature (64 bytes)" })
    .option("signer", { type: "string", demandOption: true, describe: "Pubkey of allowlisted signer who signed the voucher" })
    .option("rpc", { type: "string" })
    .option("wallet", { type: "string" })
    .strict()
    .parse();

  if (argv.rpc) process.env.ANCHOR_PROVIDER_URL = argv.rpc;
  if (argv.wallet) process.env.ANCHOR_WALLET = argv.wallet;

  const provider = anchorProviderFromEnv();
  anchor.setProvider(provider);

  const rpcUrl = provider.connection.rpcEndpoint;
  const programIdStr =
    process.env.DDNS_ESCROW_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpcUrl, "ddns_escrow");
  if (!programIdStr) throw new Error("ddns_escrow program id not found (set DDNS_ESCROW_PROGRAM_ID)");
  const programId = new PublicKey(programIdStr);

  const idl = loadIdl("ddns_escrow", {
    EscrowConfig: 8 + 651,
    UserEscrow: 8 + 65,
    DomainOwner: 8 + 97,
    RedeemedVoucher: 8 + 49,
  });
  const program = new anchor.Program(idl, programId, provider);

  const voucherBytes = readVoucherBytes(argv.voucher);
  const sig = Buffer.from(argv.sig, "base64");
  if (sig.length !== 64) throw new Error(`signature length ${sig.length}, expected 64`);

  const fields = decodeVoucherV1(voucherBytes);
  const nonceLe = u64ToLe(fields.nonce);
  const redeemSeed = sha256(Buffer.concat([fields.payer.toBuffer(), nonceLe]));

  const signer = new PublicKey(argv.signer);
  const msg = voucherMessage(voucherBytes);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_config")],
    programId
  );
  const [userEscrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), fields.payer.toBuffer()],
    programId
  );
  const [domainOwnerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("domain_owner"), fields.nameHash],
    programId
  );
  const [redeemedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("redeemed"), fields.payer.toBuffer(), redeemSeed],
    programId
  );

  const config = await program.account.escrowConfig.fetch(configPda);
  const userEscrow = await program.account.userEscrow.fetch(userEscrowPda);
  const domainOwner = await program.account.domainOwner.fetch(domainOwnerPda);
  const payerVault = new PublicKey(userEscrow.vault);

  // sanity: destination vault accounts exist
  await getAccount(provider.connection, new PublicKey(config.minersVault));
  await getAccount(provider.connection, new PublicKey(config.treasuryVault));
  await getAccount(provider.connection, new PublicKey(domainOwner.payoutTokenAccount));
  await getAccount(provider.connection, payerVault);

  const edIx = Ed25519Program.createInstructionWithPublicKey({
    publicKey: signer.toBytes(),
    message: msg,
    signature: sig,
  });

  const redeemIx = await program.methods
    .redeemTollVoucher(
      voucherBytes,
      Array.from(sig) as any,
      new BN(fields.nonce.toString()),
      Array.from(redeemSeed) as any
    )
    .accounts({
      config: configPda,
      voucherPayer: fields.payer,
      userEscrow: userEscrowPda,
      payerVault,
      domainOwner: domainOwnerPda,
      domainOwnerAta: new PublicKey(domainOwner.payoutTokenAccount),
      minersVault: new PublicKey(config.minersVault),
      treasuryVault: new PublicKey(config.treasuryVault),
      redeemedVoucher: redeemedPda,
      feePayer: provider.wallet.publicKey,
      sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(edIx).add(redeemIx);
  const sigTx = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });

  console.log(
    JSON.stringify(
      {
        programId: programId.toBase58(),
        tx: sigTx,
        payer: fields.payer.toBase58(),
        nameHashHex: Buffer.from(fields.nameHash).toString("hex"),
        amount: fields.amount.toString(),
        nonce: fields.nonce.toString(),
        configPda: configPda.toBase58(),
        userEscrowPda: userEscrowPda.toBase58(),
        payerVault: payerVault.toBase58(),
        domainOwnerPda: domainOwnerPda.toBase58(),
        redeemedVoucherPda: redeemedPda.toBase58(),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

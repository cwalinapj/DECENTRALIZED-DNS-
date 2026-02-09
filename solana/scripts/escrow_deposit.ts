import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAccount,
} from "@solana/spl-token";
import {
  anchorProviderFromEnv,
  loadIdl,
  readProgramIdFromAnchorToml,
} from "./escrow_utils.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("toll-mint", { type: "string", demandOption: true })
    .option("amount", { type: "string", demandOption: true, describe: "Amount in base units (u64)" })
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

  const tollMint = new PublicKey(argv["toll-mint"]);
  const user = provider.wallet.publicKey;
  const amount = BigInt(argv.amount);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_config")],
    programId
  );
  const [userEscrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), user.toBuffer()],
    programId
  );

  const userAta = await getAssociatedTokenAddress(tollMint, user);

  // init escrow if needed
  const escrowInfo = await provider.connection.getAccountInfo(userEscrowPda);
  let initTx: string | null = null;
  let vault: PublicKey;
  if (!escrowInfo) {
    // Create a vault token account owned by the escrow PDA (no escrow signature needed).
    const payerKp = (provider.wallet as any).payer;
    vault = await createAccount(
      provider.connection,
      payerKp,
      tollMint,
      userEscrowPda,
      Keypair.generate()
    );

    initTx = await program.methods
      .initUserEscrow()
      .accounts({
        config: configPda,
        userEscrow: userEscrowPda,
        vault,
        tollMint,
        user,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  } else {
    const escrow = await program.account.userEscrow.fetch(userEscrowPda);
    vault = new PublicKey(escrow.vault);
  }

  // sanity: make sure ATA exists
  await getAccount(provider.connection, userAta);

  const depositTx = await program.methods
    .deposit(new BN(amount.toString()))
    .accounts({
      config: configPda,
      userEscrow: userEscrowPda,
      userAta,
      vault,
      user,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log(
    JSON.stringify(
      {
        programId: programId.toBase58(),
        configPda: configPda.toBase58(),
        userEscrowPda: userEscrowPda.toBase58(),
        vault: vault.toBase58(),
        userAta: userAta.toBase58(),
        amount: amount.toString(),
        initTx,
        depositTx,
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

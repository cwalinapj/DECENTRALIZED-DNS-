import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  anchorProviderFromEnv,
  loadIdl,
  readProgramIdFromAnchorToml,
} from "./escrow_utils.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("toll-mint", { type: "string", demandOption: true })
    .option("domain-bps", { type: "number", default: 1000 })
    .option("miners-bps", { type: "number", default: 2000 })
    .option("treasury-bps", { type: "number", default: 7000 })
    .option("allowlisted-signer", {
      type: "array",
      describe: "Pubkey(s) allowed to sign vouchers (defaults to wallet pubkey)",
    })
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
  const authority = provider.wallet.publicKey;

  const allowlisted =
    (argv["allowlisted-signer"]?.map((s) => new PublicKey(String(s))) as PublicKey[] | undefined) ||
    [authority];

  // MVP: vaults are plain SPL token accounts holding funds for miners/treasury.
  // They are distinct accounts (not ATAs) to keep balances separately auditable.
  const payerKp = (provider.wallet as any).payer;
  const minersVault = await createAccount(
    provider.connection,
    payerKp,
    tollMint,
    authority,
    Keypair.generate()
  );
  const treasuryVault = await createAccount(
    provider.connection,
    payerKp,
    tollMint,
    authority,
    Keypair.generate()
  );

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_config")],
    programId
  );

  const tx = await program.methods
    .initConfig(
      authority,
      tollMint,
      minersVault,
      treasuryVault,
      argv["domain-bps"],
      argv["miners-bps"],
      argv["treasury-bps"],
      allowlisted
    )
    .accounts({
      config: configPda,
      tollMint,
      minersVault,
      treasuryVault,
      payer: authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(
    JSON.stringify(
      {
        programId: programId.toBase58(),
        configPda: configPda.toBase58(),
        tollMint: tollMint.toBase58(),
        minersVault: minersVault.toBase58(),
        treasuryVault: treasuryVault.toBase58(),
        allowlistedSigners: allowlisted.map((p) => p.toBase58()),
        tx,
        tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
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

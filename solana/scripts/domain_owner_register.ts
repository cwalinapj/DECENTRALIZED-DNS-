import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import {
  anchorProviderFromEnv,
  loadIdl,
  nameHashFromDnsName,
  readProgramIdFromAnchorToml,
} from "./escrow_utils.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("name", { type: "string", demandOption: true, describe: "example.dns" })
    .option("toll-mint", { type: "string", describe: "Required unless --payout is provided" })
    .option("payout", { type: "string", describe: "Payout token account pubkey (TOLL mint)" })
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

  const ownerWallet = provider.wallet.publicKey;
  const nameHash = nameHashFromDnsName(argv.name);

  let payoutTokenAccount: PublicKey;
  if (argv.payout) {
    payoutTokenAccount = new PublicKey(argv.payout);
  } else {
    if (!argv["toll-mint"]) throw new Error("--toll-mint required when --payout not provided");
    const tollMint = new PublicKey(argv["toll-mint"]);
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as any).payer,
      tollMint,
      ownerWallet
    );
    payoutTokenAccount = ata.address;
  }

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_config")],
    programId
  );
  const [domainOwnerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("domain_owner"), nameHash],
    programId
  );

  const tx = await program.methods
    .registerDomainOwner(Array.from(nameHash), ownerWallet, payoutTokenAccount)
    .accounts({
      config: configPda,
      domainOwner: domainOwnerPda,
      payoutTokenAccount,
      ownerWallet,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(
    JSON.stringify(
      {
        programId: programId.toBase58(),
        name: argv.name,
        nameHashHex: Buffer.from(nameHash).toString("hex"),
        configPda: configPda.toBase58(),
        domainOwnerPda: domainOwnerPda.toBase58(),
        payoutTokenAccount: payoutTokenAccount.toBase58(),
        tx,
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


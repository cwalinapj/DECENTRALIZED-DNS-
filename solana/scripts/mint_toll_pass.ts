import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import {
  createMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function parseHash32(input?: string): number[] {
  if (!input) return new Array(32).fill(0);
  const hex = input.startsWith("0x") ? input.slice(2) : input;
  if (hex.length !== 64) {
    throw new Error("hash must be 32 bytes hex (64 hex chars)");
  }
  const bytes = [];
  for (let i = 0; i < 64; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

function loadIdl() {
  const idlPath = path.resolve("target/idl/ddns_anchor.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error(
      `IDL not found at ${idlPath}. Run 'anchor build' in /solana first.`
    );
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("name", {
      type: "string",
      default: "DDNS Toll Pass",
      describe: "Name to register in the toll pass record",
    })
    .option("page-cid-hash", {
      type: "string",
      describe: "32-byte hex hash for page CID",
    })
    .option("metadata-hash", {
      type: "string",
      describe: "32-byte hex hash for metadata",
    })
    .option("rpc", {
      type: "string",
      describe: "Override ANCHOR_PROVIDER_URL",
    })
    .option("wallet", {
      type: "string",
      describe: "Override ANCHOR_WALLET",
    })
    .option("dry-run", {
      type: "boolean",
      default: false,
      describe: "Do not send transactions",
    })
    .strict()
    .parse();

  if (argv.rpc) {
    process.env.ANCHOR_PROVIDER_URL = argv.rpc;
  }
  if (argv.wallet) {
    process.env.ANCHOR_WALLET = argv.wallet;
  }

  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || ".", ".config/solana/id.json");
  const payer = loadKeypair(walletPath);
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idl = loadIdl();
  const programId = new PublicKey(
    idl.metadata?.address ?? idl.address ?? "2kE76PBfDwKvSsfBW9xMBxaor8AoEooVDA7DkGd8WVR1"
  );
  const program = new anchor.Program(idl, programId, provider);

  const owner = payer.publicKey;

  const [tollPassPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("toll_pass"), owner.toBuffer()],
    programId
  );
  const [recordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("name"), Buffer.from(argv.name)],
    programId
  );

  const pageCidHash = parseHash32(argv["page-cid-hash"]);
  const metadataHash = parseHash32(argv["metadata-hash"]);

  console.log("provider_url:", rpcUrl);
  console.log("program_id:", programId.toBase58());
  console.log("pda_toll_pass:", tollPassPda.toBase58());
  console.log("pda_record:", recordPda.toBase58());

  let mint: PublicKey;
  let tokenAccount: PublicKey;

  if (argv["dry-run"]) {
    const mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;
    tokenAccount = await getAssociatedTokenAddress(mint, owner);
    console.log("mint:", mint.toBase58());
    console.log("token_account:", tokenAccount.toBase58());
    console.log("dry_run: not sending transaction");
    return;
  }

  // Create mint (decimals=0) with payer as mint & freeze authority.
  mint = await createMint(
    provider.connection,
    payer,
    owner,
    owner,
    0,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );

  // Create associated token account for owner (pre-created for program).
  const ata = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    mint,
    owner,
    false,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID
  );
  tokenAccount = ata.address;

  const tx = await program.methods
    .issueTollPass(argv.name, pageCidHash, metadataHash)
    .accounts({
      tollPass: tollPassPda,
      record: recordPda,
      nftMint: mint,
      nftTokenAccount: tokenAccount,
      owner,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("mint:", mint.toBase58());
  console.log("token_account:", tokenAccount.toBase58());
  console.log("tx:", tx);

  // Smoke checks
  const mintInfo = await getMint(provider.connection, mint, "confirmed");
  console.log("mint_decimals:", mintInfo.decimals);
  const ataInfo = await getAccount(provider.connection, tokenAccount, "confirmed");
  console.log("ata_amount:", ataInfo.amount.toString());

  try {
    const pass = (await program.account.tollPass.fetch(tollPassPda)) as {
      owner: PublicKey;
      issuedAt: anchor.BN;
      nameHash: number[] | Uint8Array;
    };
    console.log("toll_pass_owner:", pass.owner.toBase58());
    console.log("toll_pass_issued_at:", pass.issuedAt.toString());
    console.log("toll_pass_name_hash:", Buffer.from(pass.nameHash).toString("hex"));
  } catch (err) {
    console.warn("toll_pass_fetch_failed:", (err as Error).message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  Connection,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
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

function parseHash32(input?: string): Uint8Array {
  if (!input) return new Uint8Array(32);
  const hex = input.startsWith("0x") ? input.slice(2) : input;
  if (hex.length !== 64) {
    throw new Error("hash must be 32 bytes hex (64 hex chars)");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
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
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  // Patch missing account sizes if not present in IDL (Anchor JS expects size).
  const sizeMap: Record<string, number> = {
    Config: 8 + 36,
    TollPass: 8 + 138,
    TokenLock: 8 + 123,
    NameRecord: 8 + 171,
  };
  if (Array.isArray(idl.accounts)) {
    for (const acct of idl.accounts) {
      if (acct && typeof acct === "object" && !acct.size && sizeMap[acct.name]) {
        acct.size = sizeMap[acct.name];
      }
    }
  }
  return idl;
}

function readProgramIdFromAnchorToml(rpcUrl: string): string | null {
  try {
    const tomlPath = path.resolve("Anchor.toml");
    if (!fs.existsSync(tomlPath)) return null;
    const content = fs.readFileSync(tomlPath, "utf8");
    const isLocal = /127\\.0\\.0\\.1|localhost/.test(rpcUrl);
    const section = isLocal ? "programs.localnet" : "programs.devnet";
    const re = new RegExp(`\\[${section}\\][^\\[]*?ddns_anchor\\s*=\\s*\"([^\"]+)\"`, "s");
    const match = content.match(re);
    return match ? match[1] : null;
  } catch {
    return null;
  }
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
  let programId: PublicKey | null = null;
  try {
    // Prefer Anchor workspace program id when available.
    const program = anchor.workspace.DdnsAnchor as anchor.Program;
    programId = program.programId;
  } catch {
    const fromToml = readProgramIdFromAnchorToml(rpcUrl);
    if (fromToml) programId = new PublicKey(fromToml);
  }
  if (!programId) {
    throw new Error("program id not found in Anchor workspace or Anchor.toml");
  }
  console.log("program_id:", programId.toBase58());

  const programInfo = await connection.getAccountInfo(programId, "confirmed");
  if (!programInfo) {
    throw new Error(`program id not found on this cluster: ${programId.toBase58()}`);
  }
  const ixCoder = new anchor.BorshInstructionCoder(idl);

  const owner = payer.publicKey;

  const pageCidHash = parseHash32(argv["page-cid-hash"]);
  const metadataHash = parseHash32(argv["metadata-hash"]);
  const nameHash = crypto.createHash("sha256").update(argv.name).digest();

  const [tollPassPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("toll_pass"), owner.toBuffer()],
    programId
  );
  const [recordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("name"), Buffer.from(nameHash)],
    programId
  );

  console.log("provider_url:", rpcUrl);
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

  // Skip if toll_pass PDA already exists (idempotent mint)
  const existing = await provider.connection.getAccountInfo(tollPassPda, "confirmed");
  if (existing) {
    console.log("toll_pass_exists:", tollPassPda.toBase58());
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

  const ixDef = idl.instructions?.find(
    (i: { name: string }) => i.name === "issue_toll_pass"
  );
  if (!ixDef) {
    throw new Error("IDL missing issue_toll_pass instruction");
  }
  const accountMap: Record<string, PublicKey> = {
    toll_pass: tollPassPda,
    record: recordPda,
    nft_mint: mint,
    nft_token_account: tokenAccount,
    owner: owner,
    system_program: anchor.web3.SystemProgram.programId,
    token_program: TOKEN_PROGRAM_ID,
  };
  const keys = ixDef.accounts.map(
    (a: {
      name: string;
      isMut?: boolean;
      isSigner?: boolean;
      writable?: boolean;
      signer?: boolean;
      address?: string;
    }) => {
      const pubkey = accountMap[a.name];
      if (!pubkey) {
        if (a.address) {
          return {
            pubkey: new PublicKey(a.address),
            isSigner: Boolean(a.signer),
            isWritable: Boolean(a.writable),
          };
        }
        throw new Error(`Missing account pubkey for ${a.name}`);
      }
      return {
        pubkey,
        isSigner: Boolean(a.isSigner ?? a.signer),
        isWritable: Boolean(a.isMut ?? a.writable),
      };
    }
  );
  const data = ixCoder.encode("issue_toll_pass", {
    name: argv.name,
    name_hash: nameHash,
    page_cid_hash: pageCidHash,
    metadata_hash: metadataHash,
  });
  const ix = new TransactionInstruction({
    programId,
    keys,
    data,
  });

  const tx = await provider.sendAndConfirm(new Transaction().add(ix), []);

  console.log("mint:", mint.toBase58());
  console.log("token_account:", tokenAccount.toBase58());
  console.log("tx:", tx);

  // Smoke checks
  const mintInfo = await getMint(provider.connection, mint, "confirmed");
  console.log("mint_decimals:", mintInfo.decimals);
  const ataInfo = await getAccount(provider.connection, tokenAccount, "confirmed");
  console.log("ata_amount:", ataInfo.amount.toString());

  // Best-effort fetch/decode of the toll_pass account.
  try {
    const info = await provider.connection.getAccountInfo(tollPassPda, "confirmed");
    if (!info) {
      console.warn("toll_pass_fetch_failed: account not found");
    } else {
      // Skip Anchor account coder; decode manually from layout.
      // Layout: discriminator(8) + owner(32) + issued_at(i64) + name_hash(32) + page_cid_hash(32) + metadata_hash(32) + bump(u8) + initialized(u8)
      const data = info.data;
      const ownerPk = new PublicKey(data.slice(8, 40));
      const issuedAt = Number(data.readBigInt64LE(40));
      const nameHash = data.slice(48, 80);
      console.log("toll_pass_owner:", ownerPk.toBase58());
      console.log("toll_pass_issued_at:", issuedAt.toString());
      console.log("toll_pass_name_hash:", Buffer.from(nameHash).toString("hex"));
    }
  } catch (err) {
    console.warn("toll_pass_fetch_failed:", (err as Error).message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

function loadKeypair(filePath: string): anchor.web3.Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
}

function normalizeName(name: string): string {
  let n = name.trim().toLowerCase();
  if (n.endsWith(".")) n = n.slice(0, -1);
  return n;
}

function sha256Bytes(input: string): Uint8Array {
  return crypto.createHash("sha256").update(input).digest();
}

function loadIdl() {
  const idlPath = path.resolve("target/idl/ddns_anchor.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error(
      `IDL not found at ${idlPath}. Run 'anchor build' in /solana first.`
    );
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
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
    .option("name", { type: "string", demandOption: true })
    .option("dest", { type: "string", demandOption: true })
    .option("ttl", { type: "number", default: 300 })
    .option("update-only", {
      type: "boolean",
      default: false,
      describe: "Only update an existing record; do not create",
    })
    .option("rpc", { type: "string" })
    .option("wallet", { type: "string" })
    .option("dry-run", { type: "boolean", default: false })
    .strict()
    .parse();

  if (argv.rpc) process.env.ANCHOR_PROVIDER_URL = argv.rpc;
  if (argv.wallet) process.env.ANCHOR_WALLET = argv.wallet;

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
    readProgramIdFromAnchorToml(rpcUrl) ??
      idl.metadata?.address ??
      idl.address ??
      "9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes"
  );
  const accountsCoder = new anchor.BorshAccountsCoder(idl);
  const ixCoder = new anchor.BorshInstructionCoder(idl);

  const normalizedName = normalizeName(argv.name);
  const nameHash = sha256Bytes(normalizedName);
  const destHash = sha256Bytes(argv.dest);

  const [recordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("name"), Buffer.from(nameHash)],
    programId
  );
  const [tollPassPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("toll_pass"), payer.publicKey.toBuffer()],
    programId
  );

  console.log("provider_url:", rpcUrl);
  console.log("program_id:", programId.toBase58());
  console.log("record_pda:", recordPda.toBase58());
  console.log("toll_pass_pda:", tollPassPda.toBase58());
  console.log("name_hash:", Buffer.from(nameHash).toString("hex"));
  console.log("dest_hash:", Buffer.from(destHash).toString("hex"));
  console.log("ttl:", argv.ttl);

  const pageCidHash = destHash;
  const metadataHash = new Uint8Array(32);

  const recordInfo = await connection.getAccountInfo(recordPda, "confirmed");
  if (!recordInfo && argv["update-only"]) {
    throw new Error("record does not exist; use create or omit --update-only");
  }
  const ixName = recordInfo ? "update_name_record" : "create_name_record";
  const ixDef = idl.instructions?.find(
    (i: { name: string }) => i.name === ixName
  );
  if (!ixDef) {
    throw new Error(`IDL missing ${ixName} instruction`);
  }
  const accountMap: Record<string, PublicKey> = {
    record: recordPda,
    toll_pass: tollPassPda,
    owner: payer.publicKey,
    system_program: anchor.web3.SystemProgram.programId,
    systemProgram: anchor.web3.SystemProgram.programId,
  };
  const keys = ixDef.accounts.map(
    (a: { name: string; isMut?: boolean; isSigner?: boolean; writable?: boolean; signer?: boolean; address?: string }) => {
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
  const data =
    ixName === "create_name_record"
      ? ixCoder.encode("create_name_record", {
          name: normalizedName,
          name_hash: nameHash,
          page_cid_hash: pageCidHash,
          metadata_hash: metadataHash,
        })
      : ixCoder.encode("update_name_record", {
          page_cid_hash: pageCidHash,
          metadata_hash: metadataHash,
        });
  const ix = new TransactionInstruction({
    programId,
    keys,
    data,
  });

  if (argv["dry-run"]) {
    console.log("instruction:", {
      programId: ix.programId.toBase58(),
      keys: ix.keys.map((k) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      dataLength: ix.data.length,
    });
    console.log("action:", ixName === "create_name_record" ? "create" : "update");
    console.log("dry_run: not sending transaction");
    return;
  }

  const tx = await provider.sendAndConfirm(new Transaction().add(ix), []);

  console.log("action:", ixName === "create_name_record" ? "create" : "update");
  console.log("tx:", tx);

  const info = await connection.getAccountInfo(recordPda, "confirmed");
  if (!info) {
    throw new Error("record account not found after tx");
  }
  const decoded = accountsCoder.decode("NameRecord", info.data) as any;
  console.log(
    "record_owner:",
    decoded.owner?.toBase58?.() ?? decoded.owner?.toString?.() ?? "unknown"
  );
  const decodedNameHash = decoded.nameHash ?? decoded.name_hash;
  const decodedPageCidHash = decoded.pageCidHash ?? decoded.page_cid_hash;
  const decodedMetadataHash = decoded.metadataHash ?? decoded.metadata_hash;
  if (decodedNameHash) {
    console.log(
      "record_name_hash:",
      Buffer.from(decodedNameHash).toString("hex")
    );
  }
  if (decodedPageCidHash) {
    console.log(
      "record_dest_hash:",
      Buffer.from(decodedPageCidHash).toString("hex")
    );
  }
  if (decodedMetadataHash) {
    console.log(
      "record_metadata_hash:",
      Buffer.from(decodedMetadataHash).toString("hex")
    );
  }
  if (decoded.updatedAt) {
    console.log("record_updated_at:", decoded.updatedAt.toString());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

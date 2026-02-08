import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  PROGRAM_ID as MPL_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
  createCreateMasterEditionV3Instruction,
  createUpdateMetadataAccountV2Instruction,
} from "@metaplex-foundation/mpl-token-metadata";

type CreatorInput = {
  address: PublicKey;
  verified: boolean;
  share: number;
};

function loadKeypair(filePath: string): Keypair {
  const data = fs.readFileSync(filePath, "utf8");
  const secret = Uint8Array.from(JSON.parse(data));
  return Keypair.fromSecretKey(secret);
}

function parseCreators(input?: string): CreatorInput[] | null {
  if (!input) return null;
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map((part) => {
    const [pubkeyStr, shareStr, verifiedStr] = part.split(":");
    if (!pubkeyStr || !shareStr) {
      throw new Error(`Invalid creators entry: ${part}`);
    }
    const share = Number(shareStr);
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      throw new Error(`Invalid share for creator: ${part}`);
    }
    const verified = verifiedStr ? verifiedStr === "true" || verifiedStr === "1" : false;
    return {
      address: new PublicKey(pubkeyStr),
      verified,
      share,
    };
  });
}

function isValidUri(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("ipfs://");
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("rpc", { type: "string" })
    .option("keypair", { type: "string" })
    .option("mint", { type: "string", demandOption: true })
    .option("name", { type: "string", demandOption: true })
    .option("symbol", { type: "string", default: "DDNS" })
    .option("uri", { type: "string", demandOption: true })
    .option("seller-fee-bps", { type: "number", default: 0 })
    .option("creators", { type: "string" })
    .option("master-edition", { type: "boolean", default: false })
    .option("dry-run", { type: "boolean", default: false })
    .option("force", { type: "boolean", default: false })
    .strict()
    .parse();

  const rpcUrl =
    argv.rpc ||
    process.env.ANCHOR_PROVIDER_URL ||
    "https://api.devnet.solana.com";
  const keypairPath =
    argv.keypair || path.join(process.env.HOME || ".", ".config/solana/id.json");
  const mint = new PublicKey(argv.mint);
  const name = argv.name;
  const symbol = argv.symbol;
  const uri = argv.uri;
  const sellerFeeBps = Number(argv["seller-fee-bps"]);

  if (!isValidUri(uri)) {
    throw new Error("Invalid uri: must start with http(s):// or ipfs://");
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadKeypair(keypairPath);

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    MPL_PROGRAM_ID
  );
  const [masterEditionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from("edition")],
    MPL_PROGRAM_ID
  );

  const creators = parseCreators(argv.creators);
  const metadataAccount = await connection.getAccountInfo(metadataPda);
  const masterEditionAccount = argv["master-edition"]
    ? await connection.getAccountInfo(masterEditionPda)
    : null;

  const tx = new Transaction();

  if (!metadataAccount) {
    tx.add(
      createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataPda,
          mint,
          mintAuthority: payer.publicKey,
          payer: payer.publicKey,
          updateAuthority: payer.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name,
              symbol,
              uri,
              sellerFeeBasisPoints: sellerFeeBps,
              creators,
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          },
        }
      )
    );
  } else if (argv.force) {
    tx.add(
      createUpdateMetadataAccountV2Instruction(
        {
          metadata: metadataPda,
          updateAuthority: payer.publicKey,
        },
        {
          updateMetadataAccountArgsV2: {
            data: {
              name,
              symbol,
              uri,
              sellerFeeBasisPoints: sellerFeeBps,
              creators,
              collection: null,
              uses: null,
            },
            updateAuthority: payer.publicKey,
            primarySaleHappened: null,
            isMutable: true,
          },
        }
      )
    );
  } else {
    console.log("Metadata already exists; skipping update (use --force to update).");
  }

  if (argv["master-edition"]) {
    if (masterEditionAccount) {
      console.log("Master edition already exists; skipping.");
    } else {
      tx.add(
        createCreateMasterEditionV3Instruction(
          {
            edition: masterEditionPda,
            mint,
            updateAuthority: payer.publicKey,
            mintAuthority: payer.publicKey,
            payer: payer.publicKey,
            metadata: metadataPda,
          },
          { createMasterEditionArgs: { maxSupply: 0 } }
        )
      );
    }
  }

  console.log("metadata_pda:", metadataPda.toBase58());
  console.log("master_edition_pda:", masterEditionPda.toBase58());
  console.log("instructions:", tx.instructions.map((ix) => ({
    programId: ix.programId.toBase58(),
    keys: ix.keys.map((k) => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    dataLength: ix.data.length,
  })));

  if (argv["dry-run"]) {
    console.log("Dry run: not sending transaction.");
    return;
  }

  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
  console.log(`Metadata applied: ${sig}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

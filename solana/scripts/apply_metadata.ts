import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  PROGRAM_ID as MPL_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
  createCreateMasterEditionV3Instruction,
} from "@metaplex-foundation/mpl-token-metadata";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

function loadKeypair(filePath: string): Keypair {
  const data = fs.readFileSync(filePath, "utf8");
  const secret = Uint8Array.from(JSON.parse(data));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const rpcUrl = argValue("--rpc") || "https://api.devnet.solana.com";
  const keypairPath =
    argValue("--keypair") || path.join(process.env.HOME || ".", ".config/solana/id.json");
  const mintStr = argValue("--mint");
  const name = argValue("--name");
  const symbol = argValue("--symbol") || "DDNS";
  const uri = argValue("--uri");
  const sellerFeeBps = Number(argValue("--seller-fee-bps") || "0");

  if (!mintStr || !name || !uri) {
    console.error("Usage: ts-node scripts/apply_metadata.ts --mint <MINT> --name <NAME> --uri <URI> [--symbol DDNS] [--seller-fee-bps 0] [--rpc URL] [--keypair PATH]");
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadKeypair(keypairPath);
  const mint = new PublicKey(mintStr);

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    MPL_PROGRAM_ID
  );
  const [masterEditionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from("edition")],
    MPL_PROGRAM_ID
  );

  const metadataIx = createCreateMetadataAccountV3Instruction(
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
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      },
    }
  );

  const editionIx = createCreateMasterEditionV3Instruction(
    {
      edition: masterEditionPda,
      mint,
      updateAuthority: payer.publicKey,
      mintAuthority: payer.publicKey,
      payer: payer.publicKey,
      metadata: metadataPda,
    },
    {
      createMasterEditionArgs: {
        maxSupply: 0,
      },
    }
  );

  const tx = new Transaction().add(metadataIx, editionIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
  console.log(`Metadata applied: ${sig}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

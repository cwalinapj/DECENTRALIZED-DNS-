import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  createCreateMasterEditionV3Instruction,
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
  MPL_TOKEN_METADATA_PROGRAM_ID,
} from "./metadata.js";
import { TOKEN_PROGRAM_ID } from "./token.js";

const MINT = new PublicKey("So11111111111111111111111111111111111111112");
const AUTH = new PublicKey("B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5");
const META = new PublicKey("6dM4TqWyWJsbx7obrdLcviBkTafD5E8av61zfU6jq57X");
const EDITION = new PublicKey("7r1W5yu5i7ev1wPNGsNuRLcdKW1sCy2x4rwyQkdi9ew2");

test("createCreateMetadataAccountV3Instruction encodes discriminator and keys", () => {
  const ix = createCreateMetadataAccountV3Instruction(
    {
      metadata: META,
      mint: MINT,
      mintAuthority: AUTH,
      payer: AUTH,
      updateAuthority: AUTH,
      rent: SYSVAR_RENT_PUBKEY,
    },
    {
      data: {
        name: "demo",
        symbol: "DDNS",
        uri: "https://example.com",
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
      },
      isMutable: true,
      collectionDetails: null,
    },
  );
  assert.equal(ix.programId.toBase58(), MPL_TOKEN_METADATA_PROGRAM_ID.toBase58());
  assert.equal(ix.data.readUInt8(0), 33);
  assert.equal(ix.keys[5]?.pubkey.toBase58(), SystemProgram.programId.toBase58());
  assert.equal(ix.keys[6]?.pubkey.toBase58(), SYSVAR_RENT_PUBKEY.toBase58());
});

test("createUpdateMetadataAccountV2Instruction encodes option fields", () => {
  const ix = createUpdateMetadataAccountV2Instruction(
    { metadata: META, updateAuthority: AUTH },
    {
      data: null,
      updateAuthority: AUTH,
      primarySaleHappened: null,
      isMutable: false,
    },
  );
  assert.equal(ix.data.readUInt8(0), 15);
  assert.equal(ix.keys.length, 2);
});

test("createCreateMasterEditionV3Instruction uses token program by default", () => {
  const ix = createCreateMasterEditionV3Instruction(
    {
      edition: EDITION,
      mint: MINT,
      updateAuthority: AUTH,
      mintAuthority: AUTH,
      payer: AUTH,
      metadata: META,
      rent: SYSVAR_RENT_PUBKEY,
    },
    { maxSupply: 0n },
  );
  assert.equal(ix.data.readUInt8(0), 17);
  assert.equal(ix.keys[6]?.pubkey.toBase58(), TOKEN_PROGRAM_ID.toBase58());
});

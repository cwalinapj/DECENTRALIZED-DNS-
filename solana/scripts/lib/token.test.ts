import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "./token.js";

test("getAssociatedTokenAddressSync derives canonical ATA", () => {
  const mint = new PublicKey("So11111111111111111111111111111111111111112");
  const owner = new PublicKey("B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5");
  const [expected] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  assert.equal(getAssociatedTokenAddressSync(mint, owner).toBase58(), expected.toBase58());
});

test("createInitializeMintInstruction encodes rent-backed initialize mint", () => {
  const mint = new PublicKey("So11111111111111111111111111111111111111112");
  const authority = new PublicKey("B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5");
  const ix = createInitializeMintInstruction(mint, 9, authority, null);
  assert.equal(ix.programId.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(ix.keys[0]?.pubkey.toBase58(), mint.toBase58());
  assert.equal(ix.keys[1]?.pubkey.toBase58(), SYSVAR_RENT_PUBKEY.toBase58());
  assert.equal(ix.data.readUInt8(0), 0);
  assert.equal(ix.data.readUInt8(1), 9);
});

test("createAssociatedTokenAccountInstruction targets ATA program", () => {
  const payer = new PublicKey("B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5");
  const owner = new PublicKey("11111111111111111111111111111111");
  const mint = new PublicKey("So11111111111111111111111111111111111111112");
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const ix = createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
  assert.equal(ix.programId.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  assert.equal(ix.keys[4]?.pubkey.toBase58(), SystemProgram.programId.toBase58());
  assert.equal(ix.keys[5]?.pubkey.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(ix.data.length, 0);
});

test("createMintToInstruction encodes u64 amount", () => {
  const mint = new PublicKey("So11111111111111111111111111111111111111112");
  const destination = new PublicKey("B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5");
  const authority = new PublicKey("11111111111111111111111111111111");
  const ix = createMintToInstruction(mint, destination, authority, 123n);
  assert.equal(ix.programId.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(ix.data.readUInt8(0), 7);
  assert.equal(ix.data.readBigUInt64LE(1), 123n);
});

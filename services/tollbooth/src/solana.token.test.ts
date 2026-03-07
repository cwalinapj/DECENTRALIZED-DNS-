import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
} from "./solana.js";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

test("getAssociatedTokenAddressSync derives the canonical ATA PDA", () => {
  const mint = new PublicKey("So11111111111111111111111111111111111111112");
  const owner = new PublicKey("B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5");
  const derived = getAssociatedTokenAddressSync(mint, owner);
  const [expected] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  assert.equal(derived.toBase58(), expected.toBase58());
});

test("createInitializeMint2Instruction encodes decimals and authorities", () => {
  const mint = new PublicKey("So11111111111111111111111111111111111111112");
  const authority = new PublicKey("B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5");
  const freeze = new PublicKey("11111111111111111111111111111111");
  const ix = createInitializeMint2Instruction(mint, 9, authority, freeze);

  assert.equal(ix.programId.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(ix.keys.length, 1);
  assert.equal(ix.keys[0]?.pubkey.toBase58(), mint.toBase58());
  assert.equal(ix.data.length, 67);
  assert.equal(ix.data.readUInt8(0), 20);
  assert.equal(ix.data.readUInt8(1), 9);
  assert.equal(Buffer.from(ix.data.subarray(2, 34)).equals(authority.toBuffer()), true);
  assert.equal(ix.data.readUInt8(34), 1);
  assert.equal(Buffer.from(ix.data.subarray(35, 67)).equals(freeze.toBuffer()), true);
});

test("createAssociatedTokenAccountInstruction targets the ATA program", () => {
  const payer = new PublicKey("B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5");
  const owner = new PublicKey("11111111111111111111111111111111");
  const mint = new PublicKey("So11111111111111111111111111111111111111112");
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const ix = createAssociatedTokenAccountInstruction(payer, ata, owner, mint);

  assert.equal(ix.programId.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  assert.equal(ix.keys.length, 6);
  assert.equal(ix.keys[0]?.pubkey.toBase58(), payer.toBase58());
  assert.equal(ix.keys[4]?.pubkey.toBase58(), SystemProgram.programId.toBase58());
  assert.equal(ix.keys[5]?.pubkey.toBase58(), TOKEN_PROGRAM_ID.toBase58());
  assert.equal(ix.data.length, 0);
});

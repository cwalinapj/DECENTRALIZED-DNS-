import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { decodeLegacyTollPassAccount } from "./solana.js";

function legacyFixtureWithDiscriminator() {
  const owner = new PublicKey("B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5");
  const ownerMint = new PublicKey("So11111111111111111111111111111111111111112");
  const body = Buffer.alloc(32 + 8 + 32 + 32 + 32 + 1 + 1);
  let off = 0;
  owner.toBuffer().copy(body, off); off += 32;
  body.writeBigInt64LE(123456789n, off); off += 8;
  Buffer.alloc(32, 0xab).copy(body, off); off += 32;
  ownerMint.toBuffer().copy(body, off); off += 32;
  Buffer.alloc(32, 0xcd).copy(body, off); off += 32;
  body.writeUInt8(9, off); off += 1;
  body.writeUInt8(1, off); off += 1;
  const discriminator = Buffer.alloc(8, 0xee);
  return { owner, ownerMint, data: Buffer.concat([discriminator, body]) };
}

test("decodeLegacyTollPassAccount decodes v1 legacy toll pass account", () => {
  const fx = legacyFixtureWithDiscriminator();
  const decoded = decodeLegacyTollPassAccount(fx.data);
  assert.ok(decoded);
  assert.equal(decoded.owner.toBase58(), fx.owner.toBase58());
  assert.equal(decoded.ownerMint.toBase58(), fx.ownerMint.toBase58());
  assert.equal(decoded.owner_mint.toBase58(), fx.ownerMint.toBase58());
  assert.equal(decoded.bump, 9);
  assert.equal(decoded.initialized, true);
  assert.equal(decoded.metadataHash.length, 32);
  assert.equal(Buffer.from(decoded.metadataHash).equals(Buffer.alloc(32, 0x00)), true);
});

test("decodeLegacyTollPassAccount returns null for unrelated sizes", () => {
  const decoded = decodeLegacyTollPassAccount(Buffer.alloc(17));
  assert.equal(decoded, null);
});

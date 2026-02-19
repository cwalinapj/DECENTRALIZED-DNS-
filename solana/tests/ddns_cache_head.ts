import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import crypto from "node:crypto";
import BN from "bn.js";

function hashName(name: string): Buffer {
  return crypto.createHash("sha256").update(name.trim().toLowerCase().replace(/\.+$/, "")).digest();
}

describe("ddns_cache_head", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.DdnsCacheHead as Program;

  it("inits and updates parent cache head gated by parent owner", async () => {
    const parentOwner = Keypair.generate();
    await provider.connection.requestAirdrop(parentOwner.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 900));

    const parentHash = hashName("acme.dns");
    const [headPda] = PublicKey.findProgramAddressSync([Buffer.from("cache_head"), parentHash], program.programId);

    await program.methods
      .initCacheHead([...parentHash], parentOwner.publicKey)
      .accounts({
        cacheHead: headPda,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const cacheRoot = Buffer.alloc(32, 7);
    const cidHash = crypto.createHash("sha256").update("ipfs://bafy-test", "utf8").digest();

    await program.methods
      .setCacheHead([...parentHash], [...cacheRoot], [...cidHash], new BN(123))
      .accounts({ cacheHead: headPda, parentOwner: parentOwner.publicKey })
      .signers([parentOwner])
      .rpc();

    const account: any = await program.account.domainCacheHead.fetch(headPda);
    expect(Buffer.from(account.parentNameHash).equals(parentHash)).to.equal(true);
    expect(new PublicKey(account.parentOwner).equals(parentOwner.publicKey)).to.equal(true);
    expect(Buffer.from(account.cacheRoot).equals(cacheRoot)).to.equal(true);
    expect(Buffer.from(account.cidHash).equals(cidHash)).to.equal(true);
    expect(Number(account.epochId)).to.equal(123);
  });
});

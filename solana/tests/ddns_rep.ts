import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

describe("ddns_rep", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DdnsRep as Program;

  it("bond gate + award rep + daily cap + duplicate root", async () => {
    const feePayer = (provider.wallet as any).payer as Keypair;
    const authority = feePayer.publicKey;

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_config")], program.programId);

    await program.methods
      .initRepConfig(
        new BN(1000), // epoch_len_slots
        new BN(50), // daily cap
        new BN(10_000_000), // min bond
        2, // min unique names
        1, // min unique colos
        new BN(40), // rep per valid aggregate
        new BN(0), // no decay
        new BN(0), // cooldown slots
        true
      )
      .accounts({
        authority,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const miner = Keypair.generate();
    const dropSig = await provider.connection.requestAirdrop(miner.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(dropSig, "confirmed");

    const [bondPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("rep_bond"), miner.publicKey.toBuffer()],
      program.programId
    );
    const [repPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_rep"), miner.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .depositRepBond(new BN(20_000_000))
      .accounts({
        miner: miner.publicKey,
        config: configPda,
        bond: bondPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([miner])
      .rpc();

    const slot = await provider.connection.getSlot("confirmed");
    const epoch = BigInt(Math.floor(slot / 1000));

    const rootA = Array.from({ length: 32 }, (_, i) => (i + 1) % 255);
    await program.methods
      .awardRep(new BN(epoch.toString()), rootA, 100, 2, 1)
      .accounts({
        miner: miner.publicKey,
        config: configPda,
        bond: bondPda,
        rep: repPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([miner])
      .rpc();

    // duplicate root must fail
    try {
      await program.methods
        .awardRep(new BN(epoch.toString()), rootA, 100, 2, 1)
        .accounts({
          miner: miner.publicKey,
          config: configPda,
          bond: bondPda,
          rep: repPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([miner])
        .rpc();
      expect.fail("expected duplicate root failure");
    } catch (e: any) {
      expect(String(e)).to.match(/DuplicateRoot|duplicate/i);
    }

    // second unique root should be capped by daily cap (50 total).
    const rootB = Array.from({ length: 32 }, (_, i) => (i + 2) % 255);
    await program.methods
      .awardRep(new BN(epoch.toString()), rootB, 100, 10, 2)
      .accounts({
        miner: miner.publicKey,
        config: configPda,
        bond: bondPda,
        rep: repPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([miner])
      .rpc();

    const rep: any = await program.account.minerRep.fetch(repPda);
    expect(Number(rep.repTotal)).to.equal(50);
    expect(Number(rep.repToday)).to.equal(50);
  });

  it("rejects award when diversity below minimum", async () => {
    const miner = Keypair.generate();
    const dropSig = await provider.connection.requestAirdrop(miner.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(dropSig, "confirmed");

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_config")], program.programId);
    const [bondPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("rep_bond"), miner.publicKey.toBuffer()],
      program.programId
    );
    const [repPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_rep"), miner.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .depositRepBond(new BN(20_000_000))
      .accounts({
        miner: miner.publicKey,
        config: configPda,
        bond: bondPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([miner])
      .rpc();

    const slot = await provider.connection.getSlot("confirmed");
    const epoch = BigInt(Math.floor(slot / 1000));
    const root = Array.from({ length: 32 }, (_, i) => (i + 7) % 255);

    try {
      await program.methods
        .awardRep(new BN(epoch.toString()), root, 20, 1, 0)
        .accounts({
          miner: miner.publicKey,
          config: configPda,
          bond: bondPda,
          rep: repPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([miner])
        .rpc();
      expect.fail("expected diversity gate failure");
    } catch (e: any) {
      expect(String(e)).to.match(/DiversityTooLow|diversity/i);
    }
  });
});

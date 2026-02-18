import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";

async function advanceSlots(provider: anchor.AnchorProvider, count: number) {
  const start = await provider.connection.getSlot("confirmed");
  const target = start + count;
  while ((await provider.connection.getSlot("confirmed")) < target) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("ddns_rep", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DdnsRep as Program;

  it("enforces cooldown + daily cap and updates miner capabilities tier", async () => {
    const authority = (provider.wallet as any).payer.publicKey as PublicKey;
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_config")], program.programId);

    await program.methods
      .initRepConfig(
        new BN(1000), // epoch len
        new BN(2000), // daily cap
        new BN(10_000_000), // min bond lamports
        2, // min unique names
        1, // min unique colos
        new BN(600), // base REP
        new BN(0), // decay
        new BN(2), // cooldown slots
        true
      )
      .accounts({ authority, config: configPda, systemProgram: SystemProgram.programId })
      .rpc();

    const miner = Keypair.generate();
    const dropSig = await provider.connection.requestAirdrop(miner.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(dropSig, "confirmed");

    const [bondPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_bond"), miner.publicKey.toBuffer()], program.programId);
    const [repPda] = PublicKey.findProgramAddressSync([Buffer.from("miner_rep"), miner.publicKey.toBuffer()], program.programId);
    const [capsPda] = PublicKey.findProgramAddressSync([Buffer.from("miner_caps"), miner.publicKey.toBuffer()], program.programId);

    await program.methods
      .depositRepBond(new BN(20_000_000))
      .accounts({ miner: miner.publicKey, config: configPda, bond: bondPda, systemProgram: SystemProgram.programId })
      .signers([miner])
      .rpc();

    const slot = await provider.connection.getSlot("confirmed");
    const epoch = BigInt(Math.floor(slot / 1000));

    const rootA = Array.from({ length: 32 }, (_, i) => (i + 1) % 255);
    const rootB = Array.from({ length: 32 }, (_, i) => (i + 2) % 255);
    const rootC = Array.from({ length: 32 }, (_, i) => (i + 3) % 255);

    await program.methods
      .awardRep(new BN(epoch.toString()), rootA, 100, 4, 2)
      .accounts({
        miner: miner.publicKey,
        config: configPda,
        bond: bondPda,
        rep: repPda,
        caps: capsPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([miner])
      .rpc();

    try {
      await program.methods
        .awardRep(new BN(epoch.toString()), rootB, 100, 4, 2)
        .accounts({
          miner: miner.publicKey,
          config: configPda,
          bond: bondPda,
          rep: repPda,
          caps: capsPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([miner])
        .rpc();
      expect.fail("expected cooldown failure");
    } catch (e: any) {
      expect(String(e)).to.match(/CooldownNotMet|cooldown/i);
    }

    await advanceSlots(provider, 3);

    await program.methods
      .awardRep(new BN(epoch.toString()), rootB, 100, 10, 2)
      .accounts({
        miner: miner.publicKey,
        config: configPda,
        bond: bondPda,
        rep: repPda,
        caps: capsPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([miner])
      .rpc();

    await advanceSlots(provider, 3);

    await program.methods
      .awardRep(new BN(epoch.toString()), rootC, 100, 10, 2)
      .accounts({
        miner: miner.publicKey,
        config: configPda,
        bond: bondPda,
        rep: repPda,
        caps: capsPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([miner])
      .rpc();

    const rep: any = await program.account.minerRep.fetch(repPda);
    const caps: any = await program.account.minerCapabilities.fetch(capsPda);

    expect(Number(rep.repTotal)).to.be.gte(1000);
    expect(Number(rep.repToday)).to.be.lte(2000);
    expect(Number(caps.tier)).to.equal(1);
    expect(Boolean(caps.eligibleGateway)).to.equal(true);
    expect(Boolean(caps.eligibleEdgeHost)).to.equal(false);
  });

  it("rejects award when diversity below minimum", async () => {
    const miner = Keypair.generate();
    const dropSig = await provider.connection.requestAirdrop(miner.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(dropSig, "confirmed");

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_config")], program.programId);
    const [bondPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_bond"), miner.publicKey.toBuffer()], program.programId);
    const [repPda] = PublicKey.findProgramAddressSync([Buffer.from("miner_rep"), miner.publicKey.toBuffer()], program.programId);
    const [capsPda] = PublicKey.findProgramAddressSync([Buffer.from("miner_caps"), miner.publicKey.toBuffer()], program.programId);

    await program.methods
      .depositRepBond(new BN(20_000_000))
      .accounts({ miner: miner.publicKey, config: configPda, bond: bondPda, systemProgram: SystemProgram.programId })
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
          caps: capsPda,
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

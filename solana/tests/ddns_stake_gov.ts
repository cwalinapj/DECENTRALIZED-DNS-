import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

async function waitForEpoch(provider: anchor.AnchorProvider, epochLenSlots: number, targetEpoch: number) {
  for (let i = 0; i < 60; i++) {
    const slot = await provider.connection.getSlot("confirmed");
    const epoch = Math.floor(slot / epochLenSlots);
    if (epoch >= targetEpoch) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for epoch >= ${targetEpoch}`);
}

describe("ddns_stake_gov", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DdnsStakeGov as Program;

  it("stakes, locks, exits with cooldown, slashes + jails verifier, submits snapshot", async () => {
    const feePayer = provider.wallet.publicKey;
    const feePayerKp = (provider.wallet as any).payer as Keypair;

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_gov_config")],
      program.programId
    );
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_gov_vault_authority")],
      program.programId
    );
    const [registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("verifier_registry")],
      program.programId
    );

    // Fresh config each run (localnet test validator).
    const stakeMint = await createMint(
      provider.connection,
      feePayerKp,
      feePayer,
      null,
      9
    );

    const vaultKp = Keypair.generate();

    const lockTiers = [
      { lockEpochs: new BN(1), multiplierBps: 10000 },
      { lockEpochs: new BN(7), multiplierBps: 11000 },
      { lockEpochs: new BN(30), multiplierBps: 12500 },
      { lockEpochs: new BN(90), multiplierBps: 15000 },
      { lockEpochs: new BN(180), multiplierBps: 17500 },
      { lockEpochs: new BN(365), multiplierBps: 20000 },
    ];

    const epochLenSlots = 10;

    await program.methods
      .initConfig(
        stakeMint,
        new BN(epochLenSlots),
        new BN(1_000_000_000), // 1 token (9 decimals)
        64,
        new BN(10),
        new BN(2),
        new BN(1),
        new BN(365),
        new BN(10),
        5000,
        lockTiers as any,
        [feePayer],
        [feePayer]
      )
      .accounts({
        config: configPda,
        verifierRegistry: registryPda,
        vaultAuthority,
        vault: vaultKp.publicKey,
        stakeMint,
        authority: feePayer,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([vaultKp])
      .rpc();

    const cfg: any = await program.account.stakeGovConfig.fetch(configPda);
    expect(new PublicKey(cfg.stakeMint).toBase58()).to.equal(stakeMint.toBase58());
    expect(new PublicKey(cfg.vault).toBase58()).to.equal(vaultKp.publicKey.toBase58());

    // Register verifier.
    const verifier = Keypair.generate();
    await program.methods
      .registerVerifier(verifier.publicKey, 0)
      .accounts({
        config: configPda,
        verifierRegistry: registryPda,
        authority: feePayer,
      })
      .rpc();

    // Staker flow.
    const staker = Keypair.generate();
    await provider.connection.requestAirdrop(staker.publicKey, 3e9);
    await new Promise((r) => setTimeout(r, 1000));

    const [stakerPosPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), staker.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initStakePosition()
      .accounts({
        config: configPda,
        stakePosition: stakerPosPda,
        staker: staker.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([staker])
      .rpc();

    const stakerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      feePayerKp,
      stakeMint,
      staker.publicKey
    );
    await mintTo(
      provider.connection,
      feePayerKp,
      stakeMint,
      stakerAta.address,
      feePayer,
      10_000_000_000n
    );

    await program.methods
      .stake(new BN(5_000_000_000))
      .accounts({
        config: configPda,
        vaultAuthority,
        vault: vaultKp.publicKey,
        stakePosition: stakerPosPda,
        stakerAta: stakerAta.address,
        staker: staker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([staker])
      .rpc();

    let pos: any = await program.account.stakePosition.fetch(stakerPosPda);
    expect(pos.stakedAmount.toString()).to.equal("5000000000");

    await program.methods
      .lock(new BN(2_000_000_000), new BN(5))
      .accounts({
        config: configPda,
        stakePosition: stakerPosPda,
        staker: staker.publicKey,
      })
      .signers([staker])
      .rpc();

    pos = await program.account.stakePosition.fetch(stakerPosPda);
    expect(pos.lockedAmount.toString()).to.equal("2000000000");
    expect(Number(pos.lockMultiplierBps)).to.be.greaterThanOrEqual(10000);

    await program.methods
      .requestExit(new BN(1_000_000_000))
      .accounts({ config: configPda, stakePosition: stakerPosPda, staker: staker.publicKey })
      .signers([staker])
      .rpc();

    pos = await program.account.stakePosition.fetch(stakerPosPda);
    expect(pos.pendingWithdrawAmount.toString()).to.equal("1000000000");

    // Cooldown enforcement (should fail now).
    let earlyOk = false;
    try {
      await program.methods
        .finalizeWithdraw()
        .accounts({
          config: configPda,
          vaultAuthority,
          vault: vaultKp.publicKey,
          stakePosition: stakerPosPda,
          stakerAta: stakerAta.address,
          staker: staker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([staker])
        .rpc();
      earlyOk = true;
    } catch {
      // expected
    }
    expect(earlyOk).to.equal(false);

    // Warp forward enough epochs.
    pos = await program.account.stakePosition.fetch(stakerPosPda);
    const requestedEpoch = Number(pos.exitRequestedEpoch);
    const targetEpoch = requestedEpoch + 3; // exit_cooldown_epochs=2, plus 1 for safety
    await waitForEpoch(provider, epochLenSlots, targetEpoch);

    const before = (await getAccount(provider.connection, stakerAta.address)).amount;
    await program.methods
      .finalizeWithdraw()
      .accounts({
        config: configPda,
        vaultAuthority,
        vault: vaultKp.publicKey,
        stakePosition: stakerPosPda,
        stakerAta: stakerAta.address,
        staker: staker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([staker])
      .rpc();
    const after = (await getAccount(provider.connection, stakerAta.address)).amount;
    expect(after - before).to.equal(1_000_000_000n);

    // Offender (verifier) stakes, then is slashed + jailed.
    const [verifierPosPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), verifier.publicKey.toBuffer()],
      program.programId
    );
    await provider.connection.requestAirdrop(verifier.publicKey, 3e9);
    await new Promise((r) => setTimeout(r, 1000));
    await program.methods
      .initStakePosition()
      .accounts({
        config: configPda,
        stakePosition: verifierPosPda,
        staker: verifier.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([verifier])
      .rpc();

    const verifierAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      feePayerKp,
      stakeMint,
      verifier.publicKey
    );
    await mintTo(
      provider.connection,
      feePayerKp,
      stakeMint,
      verifierAta.address,
      feePayer,
      10_000_000_000n
    );

    await program.methods
      .stake(new BN(5_000_000_000))
      .accounts({
        config: configPda,
        vaultAuthority,
        vault: vaultKp.publicKey,
        stakePosition: verifierPosPda,
        stakerAta: verifierAta.address,
        staker: verifier.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([verifier])
      .rpc();

    const reasonHash = Buffer.alloc(32, 9);
    const evidenceRef = Buffer.alloc(32, 7);
    const epochId = BigInt(Math.floor((await provider.connection.getSlot("confirmed")) / epochLenSlots));
    const [slashRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("slash"), u64le(epochId), verifier.publicKey.toBuffer(), reasonHash],
      program.programId
    );

    const beforeOffender: any = await program.account.stakePosition.fetch(verifierPosPda);
    await program.methods
      .applySlash(new BN(epochId.toString()), 1000, Array.from(reasonHash) as any, Array.from(evidenceRef) as any)
      .accounts({
        config: configPda,
        verifierRegistry: registryPda,
        offender: verifier.publicKey,
        offenderPosition: verifierPosPda,
        slashRecord: slashRecordPda,
        slasher: feePayer,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const afterOffender: any = await program.account.stakePosition.fetch(verifierPosPda);
    expect(afterOffender.stakedAmount.lt(beforeOffender.stakedAmount)).to.equal(true);

    const reg: any = await program.account.verifierRegistry.fetch(registryPda);
    const vi = reg.verifiers.find((x: any) => x.verifier.toBase58() === verifier.publicKey.toBase58());
    expect(vi).to.not.equal(undefined);
    expect(Number(vi.jailedUntilEpoch)).to.be.greaterThan(0);

    // Submit snapshot (dummy root).
    const snapEpoch = BigInt(Math.floor((await provider.connection.getSlot("confirmed")) / epochLenSlots));
    const [snapshotPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_snapshot"), u64le(snapEpoch)],
      program.programId
    );
    const root = Buffer.alloc(32, 1);
    await program.methods
      .submitSnapshot(new BN(snapEpoch.toString()), Array.from(root) as any, new BN("123"))
      .accounts({
        config: configPda,
        snapshot: snapshotPda,
        submitter: feePayer,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const snap: any = await program.account.stakeSnapshot.fetch(snapshotPda);
    expect(snap.epochId.toString()).to.equal(snapEpoch.toString());
  });
});

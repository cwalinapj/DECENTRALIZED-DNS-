import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getAccount,
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

describe("ddns_miner_score", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DdnsMinerScore as Program;

  it("reports stats, finalizes epoch, sets rewards, claims, penalizes", async () => {
    const feePayer = provider.wallet.publicKey;
    const feePayerKp = (provider.wallet as any).payer as Keypair;

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_score_config")],
      program.programId
    );
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_score_vault_authority")],
      program.programId
    );
    const [rewardVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_vault")],
      program.programId
    );

    const tollMint = await createMint(
      provider.connection,
      feePayerKp,
      feePayer,
      null,
      9
    );

    // Init config (allowlisted submitter = fee payer).
    const minerA = Keypair.generate();
    const minerB = Keypair.generate();
    const minerC = Keypair.generate();

    await program.methods
      .initMinerScoreConfig(
        new BN(100), // epoch_len_slots
        new BN(0),
        new BN(50n * 10n ** 9n), // per miner cap
        new BN(1), // min stake weight
        [feePayer],
        [minerA.publicKey, minerB.publicKey, minerC.publicKey],
        5000,
        2000,
        2000,
        1000,
        2000,
        2500,
        100
      )
      .accounts({
        config: configPda,
        vaultAuthority,
        tollMint,
        rewardVault: rewardVaultPda,
        authority: feePayer,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Fund reward vault.
    await mintTo(
      provider.connection,
      feePayerKp,
      tollMint,
      rewardVaultPda,
      feePayer,
      1_000_000_000_000n
    );

    const epochId = 1n;
    const epochStart = 100n;
    const epochEnd = 200n;

    // Miner A dominates volume -> dominance_share_bps high triggers penalty in raw_score.
    const [aPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_epoch"), u64le(epochId), minerA.publicKey.toBuffer()],
      program.programId
    );
    const [bPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_epoch"), u64le(epochId), minerB.publicKey.toBuffer()],
      program.programId
    );
    const [cPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_epoch"), u64le(epochId), minerC.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .reportMinerEpochStats(
        new BN(epochId.toString()),
        minerA.publicKey,
        new BN(1000),
        50,
        10,
        500,
        new BN((epochStart + 1n).toString()),
        new BN((epochEnd - 1n).toString()),
        9000,
        10000,
        4000
      )
      .accounts({
        config: configPda,
        minerEpoch: aPda,
        submitter: feePayer,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .reportMinerEpochStats(
        new BN(epochId.toString()),
        minerB.publicKey,
        new BN(1000),
        20,
        40,
        400,
        new BN((epochStart + 5n).toString()),
        new BN((epochEnd - 2n).toString()),
        9500,
        10000,
        2000
      )
      .accounts({
        config: configPda,
        minerEpoch: bPda,
        submitter: feePayer,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .reportMinerEpochStats(
        new BN(epochId.toString()),
        minerC.publicKey,
        new BN(500),
        10,
        90,
        300,
        new BN((epochStart + 2n).toString()),
        new BN((epochEnd - 3n).toString()),
        9800,
        10000,
        1000
      )
      .accounts({
        config: configPda,
        minerEpoch: cPda,
        submitter: feePayer,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const aStats: any = await program.account.minerEpochStats.fetch(aPda);
    const bStats: any = await program.account.minerEpochStats.fetch(bPda);
    const cStats: any = await program.account.minerEpochStats.fetch(cPda);
    expect(aStats.rawScore.gt(new BN(0))).to.equal(true);
    expect(bStats.rawScore.gt(new BN(0))).to.equal(true);
    expect(cStats.rawScore.gt(new BN(0))).to.equal(true);

    // Finalize epoch totals (values supplied off-chain in MVP).
    const [totalsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("epoch_totals"), u64le(epochId)],
      program.programId
    );
    await program.methods
      .finalizeEpoch(
        new BN(epochId.toString()),
        new BN(aStats.rawScore.add(bStats.rawScore).add(cStats.rawScore).toString()),
        new BN("1"),
        new BN("0"),
        3,
        4000
      )
      .accounts({
        config: configPda,
        epochTotals: totalsPda,
        submitter: feePayer,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Set rewards (simulate off-chain quadratic allocation). Keep within cap.
    await program.methods
      .setMinerReward(new BN(epochId.toString()), minerA.publicKey, new BN("1"), new BN(10n * 10n ** 9n))
      .accounts({ config: configPda, epochTotals: totalsPda, minerEpoch: aPda, submitter: feePayer })
      .rpc();
    await program.methods
      .setMinerReward(new BN(epochId.toString()), minerB.publicKey, new BN("1"), new BN(20n * 10n ** 9n))
      .accounts({ config: configPda, epochTotals: totalsPda, minerEpoch: bPda, submitter: feePayer })
      .rpc();
    await program.methods
      .setMinerReward(new BN(epochId.toString()), minerC.publicKey, new BN("1"), new BN(30n * 10n ** 9n))
      .accounts({ config: configPda, epochTotals: totalsPda, minerEpoch: cPda, submitter: feePayer })
      .rpc();

    // Penalize miner A before claim and check reward reduced.
    const aBefore: any = await program.account.minerEpochStats.fetch(aPda);
    const reasonHash = Buffer.alloc(32, 8);
    await program.methods
      .penalizeMiner(new BN(epochId.toString()), minerA.publicKey, 5000, Array.from(reasonHash) as any)
      .accounts({ config: configPda, minerEpoch: aPda, submitter: feePayer })
      .rpc();
    const aAfter: any = await program.account.minerEpochStats.fetch(aPda);
    expect(aAfter.rewardAmount.lt(aBefore.rewardAmount)).to.equal(true);

    // Claim miner B reward.
    const bAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      feePayerKp,
      tollMint,
      minerB.publicKey
    );
    await provider.connection.requestAirdrop(minerB.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 800));
    const [bClaimPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("claim"), u64le(epochId), minerB.publicKey.toBuffer()],
      program.programId
    );

    const bStart = (await getAccount(provider.connection, bAta.address)).amount;
    await program.methods
      .claimMinerReward(new BN(epochId.toString()))
      .accounts({
        config: configPda,
        vaultAuthority,
        rewardVault: rewardVaultPda,
        minerEpoch: bPda,
        miner: minerB.publicKey,
        minerAta: bAta.address,
        claimReceipt: bClaimPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([minerB])
      .rpc();
    const bEnd = (await getAccount(provider.connection, bAta.address)).amount;
    expect(bEnd - bStart).to.equal(20n * 10n ** 9n);

    // Replay claim must fail (claim PDA exists / claimed flag).
    let replayOk = false;
    try {
      await program.methods
        .claimMinerReward(new BN(epochId.toString()))
        .accounts({
          config: configPda,
          vaultAuthority,
          rewardVault: rewardVaultPda,
          minerEpoch: bPda,
          miner: minerB.publicKey,
          minerAta: bAta.address,
          claimReceipt: bClaimPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([minerB])
        .rpc();
      replayOk = true;
    } catch {
      // expected
    }
    expect(replayOk).to.equal(false);
  });
});

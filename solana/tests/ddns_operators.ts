import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import crypto from "crypto";

import { DdnsOperators } from "../target/types/ddns_operators";

function u64LE(n: bigint) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

describe("ddns_operators (operator registry + metrics rewards)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const ops = anchor.workspace.DdnsOperators as Program<DdnsOperators>;

  it("registers operator, stakes, submits metrics, and claims rewards (TOLL)", async () => {
    const payer = provider.wallet.publicKey;

    // Create TOLL mint (payer is mint authority for test).
    const tollMint = Keypair.generate();
    const mintRent = await provider.connection.getMinimumBalanceForRentExemption(82);
    const createMintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: tollMint.publicKey,
        lamports: mintRent,
        space: 82,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(tollMint.publicKey, 9, payer, null, TOKEN_PROGRAM_ID)
    );
    await provider.sendAndConfirm(createMintTx, [tollMint]);

    const authorityAta = getAssociatedTokenAddressSync(tollMint.publicKey, payer);
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer,
          authorityAta,
          payer,
          tollMint.publicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      ),
      []
    );

    // Mint some TOLL to authority for treasury funding.
    await provider.sendAndConfirm(
      new Transaction().add(createMintToInstruction(tollMint.publicKey, authorityAta, payer, 10_000_000_000)),
      []
    );

    const [operatorsConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("operators_config")],
      ops.programId
    );
    const [treasuryAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury_authority")],
      ops.programId
    );
    const treasuryVault = Keypair.generate();

    const epochLenSlots = 100;
    const minStake = 200_000; // lamports

    await ops.methods
      .initOperatorsConfig(
        new anchor.BN(epochLenSlots),
        new anchor.BN(minStake),
        4,
        new anchor.BN(1000), // reward_per_paid_query
        new anchor.BN(10), // reward_per_verified_receipt
        new anchor.BN(0), // uptime_bonus_per_10k
        0, // latency_bonus_threshold_ms
        new anchor.BN(0), // latency_bonus
        new anchor.BN(10_000_000_000), // max_rewards_per_epoch
        [payer], // metrics_submitters (MVP allowlist)
        [], // slashing_authorities
        true
      )
      .accounts({
        authority: payer,
        operatorsConfig,
        tollMint: tollMint.publicKey,
        treasuryAuthority,
        treasuryVault: treasuryVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([treasuryVault])
      .rpc();

    // Fund treasury vault from authority ATA.
    await ops.methods
      .fundTreasury(new anchor.BN(5_000_000_000))
      .accounts({
        authority: payer,
        operatorsConfig,
        authorityTollAta: authorityAta,
        treasuryVault: treasuryVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Register operator.
    const operatorWallet = Keypair.generate();
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: operatorWallet.publicKey, lamports: 2_000_000_000 })
      ),
      []
    );

    const operatorPayoutAta = getAssociatedTokenAddressSync(tollMint.publicKey, operatorWallet.publicKey);
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer,
          operatorPayoutAta,
          operatorWallet.publicKey,
          tollMint.publicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      ),
      []
    );

    const [operator] = PublicKey.findProgramAddressSync(
      [Buffer.from("operator"), operatorWallet.publicKey.toBuffer()],
      ops.programId
    );
    const [operatorVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("operator_vault"), operatorWallet.publicKey.toBuffer()],
      ops.programId
    );

    const endpoints = [
      {
        endpointKind: 0,
        value: Array.from(crypto.randomBytes(32)),
        region: 0,
      },
      {
        endpointKind: 1,
        value: Array.from(Buffer.concat([Buffer.from([1, 2, 3, 4]), Buffer.alloc(28, 0)])),
        region: 1,
      },
    ];

    await ops.methods
      .registerOperator(2, endpoints, operatorPayoutAta)
      .accounts({
        operatorWallet: operatorWallet.publicKey,
        operatorsConfig,
        operator,
        operatorVault,
        systemProgram: SystemProgram.programId,
      })
      .signers([operatorWallet])
      .rpc();

    // Stake enough SOL to activate.
    await ops.methods
      .stakeOperator(new anchor.BN(minStake))
      .accounts({
        operatorWallet: operatorWallet.publicKey,
        operatorsConfig,
        operator,
        operatorVault,
        systemProgram: SystemProgram.programId,
      })
      .signers([operatorWallet])
      .rpc();

    // Submit metrics for current epoch.
    const slot = await provider.connection.getSlot();
    const epochId = Math.floor(slot / epochLenSlots);
    const [epochMetrics] = PublicKey.findProgramAddressSync(
      [Buffer.from("metrics"), u64LE(BigInt(epochId)), operatorWallet.publicKey.toBuffer()],
      ops.programId
    );

    await ops.methods
      .submitEpochMetrics(
        new anchor.BN(epochId),
        new anchor.BN(10), // paid_query_count
        new anchor.BN(0), // receipt_count
        10_000, // uptime_score
        0, // latency_ms_p50
        Array.from(crypto.randomBytes(32))
      )
      .accounts({
        operatorsConfig,
        submitter: payer,
        operator,
        epochMetrics,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const before = BigInt((await provider.connection.getTokenAccountBalance(operatorPayoutAta)).value.amount);
    await ops.methods
      .claimOperatorRewards(new anchor.BN(epochId))
      .accounts({
        operatorsConfig,
        operatorWallet: operatorWallet.publicKey,
        operator,
        epochMetrics,
        treasuryAuthority,
        treasuryVault: treasuryVault.publicKey,
        operatorPayoutAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([operatorWallet])
      .rpc();

    const after = BigInt((await provider.connection.getTokenAccountBalance(operatorPayoutAta)).value.amount);
    if (after <= before) throw new Error("expected operator payout token balance to increase");
  });
});

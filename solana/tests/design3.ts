import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import crypto from "crypto";

import { DdnsRegistry } from "../target/types/ddns_registry";
import { DdnsQuorum } from "../target/types/ddns_quorum";
import { DdnsStake } from "../target/types/ddns_stake";

function u64LE(n: bigint) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

async function waitForSlot(provider: anchor.AnchorProvider, minSlot: number) {
  for (;;) {
    const s = await provider.connection.getSlot();
    if (s >= minSlot) return s;
    await new Promise((r) => setTimeout(r, 300));
  }
}

describe("design3 (registry/quorum/stake)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const registry = anchor.workspace.DdnsRegistry as Program<DdnsRegistry>;
  const quorum = anchor.workspace.DdnsQuorum as Program<DdnsQuorum>;
  const stake = anchor.workspace.DdnsStake as Program<DdnsStake>;

  it("stakes + claims rewards; finalizes canonical route via quorum CPI", async () => {
    const payer = provider.wallet.publicKey;
    const epochLenSlots = 100;

    const [registryConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      registry.programId
    );

    const [quorumAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("quorum_authority")],
      quorum.programId
    );

    // Initialize quorum authority PDA (must exist on-chain to be used as signer).
    await quorum.methods
      .initQuorumAuthority()
      .accounts({
        payer,
        quorumAuthority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Initialize registry config trusting quorumAuthority as finalize_authority.
    await registry.methods
      .initConfig(
        new anchor.BN(epochLenSlots), // epoch_len_slots
        1, // min_receipts
        new anchor.BN(0), // min_stake_weight
        60, // ttl_min_s
        3600, // ttl_max_s
        quorumAuthority
      )
      .accounts({
        authority: payer,
        config: registryConfig,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Initialize stake config + reward mint.
    const rewardMint = Keypair.generate();
    const [stakeConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_config")],
      stake.programId
    );
    const [stakeVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_vault")],
      stake.programId
    );
    const [mintAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority")],
      stake.programId
    );

    // Create reward mint with mintAuthority PDA as mint authority (program will mint rewards).
    const mintRent = await provider.connection.getMinimumBalanceForRentExemption(82);
    const createMintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: rewardMint.publicKey,
        lamports: mintRent,
        space: 82,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        rewardMint.publicKey,
        9,
        mintAuthority,
        null,
        TOKEN_PROGRAM_ID
      )
    );
    await provider.sendAndConfirm(createMintTx, [rewardMint]);

    await stake.methods
      .initStakeConfig(new anchor.BN(epochLenSlots), new anchor.BN(1_000_000), new anchor.BN(1))
      .accounts({
        authority: payer,
        stakeConfig,
        stakeVault,
        mintAuthority,
        rewardMint: rewardMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Create ATA for rewards.
    const rewardAta = getAssociatedTokenAddressSync(rewardMint.publicKey, payer);
    const ataIx = createAssociatedTokenAccountInstruction(
      payer,
      rewardAta,
      payer,
      rewardMint.publicKey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await provider.sendAndConfirm(new Transaction().add(ataIx), []);

    // Stake a bit of SOL.
    const [stakePosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), payer.toBuffer()],
      stake.programId
    );
    await stake.methods
      .stake(new anchor.BN(200_000))
      .accounts({
        owner: payer,
        stakeConfig,
        stakeVault,
        stakePosition,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const slot0 = await provider.connection.getSlot();
    await waitForSlot(provider, slot0 + epochLenSlots + 1);

    await stake.methods
      .claimRewards()
      .accounts({
        owner: payer,
        stakeConfig,
        stakePosition,
        rewardMint: rewardMint.publicKey,
        userRewardAta: rewardAta,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const bal = await provider.connection.getTokenAccountBalance(rewardAta);
    if (BigInt(bal.value.amount) <= 0n) {
      throw new Error("expected reward token balance > 0");
    }

    // Quorum path: init verifier set for current epoch, submit aggregate, finalize.
    const slot = await provider.connection.getSlot();
    const epochId = Math.floor(slot / epochLenSlots);

    const [verifierSet] = PublicKey.findProgramAddressSync(
      [Buffer.from("verifierset"), u64LE(BigInt(epochId))],
      quorum.programId
    );
    await quorum.methods
      .initVerifierSet(new anchor.BN(epochId), new anchor.BN(0), [payer])
      .accounts({
        admin: payer,
        verifierSet,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const nameHash = crypto.randomBytes(32);
    const destHash = crypto.randomBytes(32);
    const receiptsRoot = Buffer.alloc(32, 0);

    const [agg] = PublicKey.findProgramAddressSync(
      [Buffer.from("agg"), u64LE(BigInt(epochId)), nameHash, payer.toBuffer()],
      quorum.programId
    );
    await quorum.methods
      .submitAggregate(
        new anchor.BN(epochId),
        Array.from(nameHash),
        Array.from(destHash),
        300,
        1,
        new anchor.BN(0),
        Array.from(receiptsRoot)
      )
      .accounts({
        submitter: payer,
        registryConfig,
        ddnsRegistryProgram: registry.programId,
        verifierSet,
        aggregate: agg,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const [canonicalRoute] = PublicKey.findProgramAddressSync(
      [Buffer.from("canonical"), nameHash],
      registry.programId
    );

    await quorum.methods
      .finalizeIfQuorum(new anchor.BN(epochId), Array.from(nameHash), Array.from(destHash), 300)
      .accounts({
        payer,
        registryConfig,
        verifierSet,
        aggregate: agg,
        quorumAuthority,
        canonicalRoute,
        ddnsRegistryProgram: registry.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const route = await registry.account.canonicalRoute.fetch(canonicalRoute);
    const gotDest = Buffer.from(route.destHash as number[]);
    if (!gotDest.equals(destHash)) {
      throw new Error("canonical route dest_hash mismatch");
    }
  });
});

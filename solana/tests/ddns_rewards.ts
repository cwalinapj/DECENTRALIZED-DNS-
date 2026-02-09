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

import { DdnsRewards } from "../target/types/ddns_rewards";

function u64LE(n: bigint) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function normalizeFqdn(s: string) {
  const t = s.trim().toLowerCase();
  return t.endsWith(".") ? t.slice(0, -1) : t;
}

function domainHash(fqdn: string): Buffer {
  const h = crypto.createHash("sha256");
  h.update(Buffer.from(normalizeFqdn(fqdn), "utf8"));
  return h.digest();
}

describe("ddns_rewards (domain revenue share + epoch bonus)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const rewards = anchor.workspace.DdnsRewards as Program<DdnsRewards>;

  it("verifies a claim (authority), pays revenue share, submits usage, and claims epoch bonus", async () => {
    const payer = provider.wallet.publicKey;

    // Create a fresh TOLL mint (payer is mint authority for the test).
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

    // Domain owner + resolver wallets.
    const domainOwner = Keypair.generate();
    const resolver = Keypair.generate();
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: domainOwner.publicKey, lamports: 2_000_000_000 }),
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: resolver.publicKey, lamports: 2_000_000_000 })
      ),
      []
    );

    const ownerAta = getAssociatedTokenAddressSync(tollMint.publicKey, domainOwner.publicKey);
    const resolverAta = getAssociatedTokenAddressSync(tollMint.publicKey, resolver.publicKey);
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer,
          ownerAta,
          domainOwner.publicKey,
          tollMint.publicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
        createAssociatedTokenAccountInstruction(
          payer,
          resolverAta,
          resolver.publicKey,
          tollMint.publicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      ),
      []
    );

    // Mint TOLL to resolver for toll payments.
    await provider.sendAndConfirm(
      new Transaction().add(createMintToInstruction(tollMint.publicKey, resolverAta, payer, 2_000_000_000)),
      []
    );

    const [rewardsConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("rewards_config")],
      rewards.programId
    );
    const [treasuryAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury_authority")],
      rewards.programId
    );
    const treasuryVault = Keypair.generate();

    const epochLenSlots = 100;
    const domainShareBps = 1500; // 15%
    const epochRewardBps = 2000; // 20% of paid_toll_amount (bonus paid from treasury, capped)

    await rewards.methods
      .initRewardsConfig(
        domainShareBps,
        epochRewardBps,
        new anchor.BN(1), // min_toll_amount
        new anchor.BN(epochLenSlots),
        new anchor.BN(10_000_000_000), // max_reward_per_epoch_per_domain
        1, // min_unique_wallets
        new anchor.BN(1_000), // challenge_ttl_slots
        true, // enabled
        [payer] // verifiers allowlist (MVP)
      )
      .accounts({
        authority: payer,
        rewardsConfig,
        tollMint: tollMint.publicKey,
        treasuryAuthority,
        treasuryVault: treasuryVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([treasuryVault])
      .rpc();

    const fqdn = "example.com";
    const dh = domainHash(fqdn);
    const nonce = crypto.randomBytes(16);

    const [domainChallenge] = PublicKey.findProgramAddressSync(
      [Buffer.from("challenge"), dh, nonce],
      rewards.programId
    );

    await rewards.methods
      .startDomainChallenge(fqdn, Array.from(dh), Array.from(nonce))
      .accounts({
        rewardsConfig,
        owner: domainOwner.publicKey,
        domainChallenge,
        systemProgram: SystemProgram.programId,
      })
      .signers([domainOwner])
      .rpc();

    const [domainClaim] = PublicKey.findProgramAddressSync([Buffer.from("domain"), dh], rewards.programId);

    await rewards.methods
      .claimDomain(fqdn, Array.from(dh), Array.from(nonce), ownerAta)
      .accounts({
        authority: payer,
        rewardsConfig,
        domainChallenge,
        domainClaim,
        ownerWallet: domainOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const tollAmount = 1_000_000_000; // 1 token unit w/ 9 decimals
    const share = Math.floor((tollAmount * domainShareBps) / 10_000);
    const remainder = tollAmount - share;

    const beforeOwner = BigInt((await provider.connection.getTokenAccountBalance(ownerAta)).value.amount);
    const beforeTreasury = BigInt(
      (await provider.connection.getTokenAccountBalance(treasuryVault.publicKey)).value.amount
    );

    await rewards.methods
      .payTollWithDomain(Array.from(dh), new anchor.BN(tollAmount))
      .accounts({
        rewardsConfig,
        payer: resolver.publicKey,
        payerTollAta: resolverAta,
        domainClaim,
        domainOwnerPayoutAta: ownerAta,
        treasuryVault: treasuryVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([resolver])
      .rpc();

    const afterOwner = BigInt((await provider.connection.getTokenAccountBalance(ownerAta)).value.amount);
    const afterTreasury = BigInt(
      (await provider.connection.getTokenAccountBalance(treasuryVault.publicKey)).value.amount
    );
    if (afterOwner - beforeOwner !== BigInt(share)) {
      throw new Error("domain owner revenue share mismatch");
    }
    if (afterTreasury - beforeTreasury !== BigInt(remainder)) {
      throw new Error("treasury remainder mismatch");
    }

    const slot = await provider.connection.getSlot();
    const epochId = Math.floor(slot / epochLenSlots);
    const [usage] = PublicKey.findProgramAddressSync(
      [Buffer.from("usage"), dh, u64LE(BigInt(epochId))],
      rewards.programId
    );

    const root = crypto.randomBytes(32);
    await rewards.methods
      .submitDomainUsage(
        new anchor.BN(epochId),
        Array.from(dh),
        new anchor.BN(1234), // query_count
        new anchor.BN(tollAmount), // paid_toll_amount (MVP: off-chain verified)
        1, // unique_wallet_count
        Array.from(root)
      )
      .accounts({
        rewardsConfig,
        submitter: payer,
        domainClaim,
        domainUsageEpoch: usage,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const beforeOwner2 = BigInt((await provider.connection.getTokenAccountBalance(ownerAta)).value.amount);
    const expectBonus = Math.floor((tollAmount * epochRewardBps) / 10_000);

    await rewards.methods
      .claimDomainRewards(new anchor.BN(epochId), Array.from(dh))
      .accounts({
        rewardsConfig,
        owner: domainOwner.publicKey,
        domainClaim,
        domainUsageEpoch: usage,
        treasuryAuthority,
        treasuryVault: treasuryVault.publicKey,
        ownerTollAta: ownerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([domainOwner])
      .rpc();

    const afterOwner2 = BigInt((await provider.connection.getTokenAccountBalance(ownerAta)).value.amount);
    if (afterOwner2 - beforeOwner2 !== BigInt(expectBonus)) {
      throw new Error("epoch bonus mismatch");
    }
  });
});


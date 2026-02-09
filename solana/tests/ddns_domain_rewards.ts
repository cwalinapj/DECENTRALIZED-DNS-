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

import { DdnsDomainRewards } from "../target/types/ddns_domain_rewards";

function sha256Bytes(s: string): Buffer {
  const h = crypto.createHash("sha256");
  h.update(Buffer.from(s, "utf8"));
  return h.digest();
}

function bpsAmount(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10_000n;
}

describe("ddns_domain_rewards (toll-event split: owner/miners/treasury)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const rewards = anchor.workspace.DdnsDomainRewards as Program<DdnsDomainRewards>;

  it("registers a DomainOwner and splits a toll payment immediately", async () => {
    const authority = provider.wallet.publicKey;

    // Fresh TOLL mint (test uses provider wallet as mint authority).
    const tollMint = Keypair.generate();
    const mintRent = await provider.connection.getMinimumBalanceForRentExemption(82);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: authority,
          newAccountPubkey: tollMint.publicKey,
          lamports: mintRent,
          space: 82,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(tollMint.publicKey, 9, authority, null, TOKEN_PROGRAM_ID)
      ),
      [tollMint]
    );

    // Two wallets: domain owner + payer (resolver).
    const domainOwner = Keypair.generate();
    const payer = Keypair.generate();
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: authority, toPubkey: domainOwner.publicKey, lamports: 2_000_000_000 }),
        SystemProgram.transfer({ fromPubkey: authority, toPubkey: payer.publicKey, lamports: 2_000_000_000 })
      ),
      []
    );

    // Token accounts.
    const payerAta = getAssociatedTokenAddressSync(tollMint.publicKey, payer.publicKey);
    const ownerAta = getAssociatedTokenAddressSync(tollMint.publicKey, domainOwner.publicKey);
    await provider.sendAndConfirm(
      new Transaction().add(
        createAssociatedTokenAccountInstruction(
          authority,
          payerAta,
          payer.publicKey,
          tollMint.publicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
        createAssociatedTokenAccountInstruction(
          authority,
          ownerAta,
          domainOwner.publicKey,
          tollMint.publicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      ),
      []
    );

    // Mint TOLL to payer for toll payments.
    await provider.sendAndConfirm(
      new Transaction().add(createMintToInstruction(tollMint.publicKey, payerAta, authority, 2_000_000_000)),
      []
    );

    const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], rewards.programId);
    const [vaultAuthority] = PublicKey.findProgramAddressSync([Buffer.from("vault_authority")], rewards.programId);
    const treasuryVault = Keypair.generate();
    const minersVault = Keypair.generate();

    // Default splits: owner=0, miners=70%, treasury=30%
    await rewards.methods
      .initConfig(0, 7000, 3000, new anchor.BN(1), true)
      .accounts({
        authority,
        config,
        tollMint: tollMint.publicKey,
        vaultAuthority,
        treasuryVault: treasuryVault.publicKey,
        minersVault: minersVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([treasuryVault, minersVault])
      .rpc();

    const name = "example.dns";
    const nameHash = sha256Bytes(name.toLowerCase());
    const [domainOwnerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("domain_owner"), nameHash],
      rewards.programId
    );

    // Register per-name splits: owner=15%, miners=15%, treasury=70%.
    const ownerBps = 1500;
    const minersBps = 1500;
    const treasuryBps = 7000;
    await rewards.methods
      .registerDomainOwner(Array.from(nameHash), ownerBps, minersBps, treasuryBps)
      .accounts({
        ownerWallet: domainOwner.publicKey,
        config,
        domainOwner: domainOwnerPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([domainOwner])
      .rpc();

    const tollAmount = 1_000_000_000n;
    const expectedOwner = bpsAmount(tollAmount, ownerBps);
    const expectedMiners = bpsAmount(tollAmount, minersBps);
    const expectedTreasury = tollAmount - expectedOwner - expectedMiners;

    const beforeOwner = BigInt((await provider.connection.getTokenAccountBalance(ownerAta)).value.amount);
    const beforeTreasury = BigInt(
      (await provider.connection.getTokenAccountBalance(treasuryVault.publicKey)).value.amount
    );
    const beforeMiners = BigInt(
      (await provider.connection.getTokenAccountBalance(minersVault.publicKey)).value.amount
    );

    await rewards.methods
      .tollPayForRoute(Array.from(nameHash), new anchor.BN(tollAmount.toString()))
      .accounts({
        config,
        payer: payer.publicKey,
        payerTollAta: payerAta,
        domainOwner: domainOwnerPda,
        ownerPayoutAta: ownerAta,
        vaultAuthority,
        treasuryVault: treasuryVault.publicKey,
        minersVault: minersVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    const afterOwner = BigInt((await provider.connection.getTokenAccountBalance(ownerAta)).value.amount);
    const afterTreasury = BigInt(
      (await provider.connection.getTokenAccountBalance(treasuryVault.publicKey)).value.amount
    );
    const afterMiners = BigInt((await provider.connection.getTokenAccountBalance(minersVault.publicKey)).value.amount);

    if (afterOwner - beforeOwner !== expectedOwner) throw new Error("owner split mismatch");
    if (afterMiners - beforeMiners !== expectedMiners) throw new Error("miners split mismatch");
    if (afterTreasury - beforeTreasury !== expectedTreasury) throw new Error("treasury split mismatch");
  });
});


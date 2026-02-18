import crypto from "node:crypto";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

function normalizeDomain(domain: string): string {
  let d = domain.trim().toLowerCase();
  if (d.endsWith(".")) d = d.slice(0, -1);
  return d;
}

function domainHash(domainNorm: string): Uint8Array {
  return crypto.createHash("sha256").update(domainNorm, "utf8").digest();
}

describe("ddns_ns_incentives (usage-based rewards)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DdnsNsIncentives as anchor.Program;

  it("funds vault, records attestation+usage, and pays usage-based rewards", async () => {
    const admin = provider.wallet.publicKey;

    const [nsConfig] = PublicKey.findProgramAddressSync([Buffer.from("ns_config")], program.programId);
    const [vaultAuthority] = PublicKey.findProgramAddressSync([Buffer.from("vault_authority")], program.programId);
    const [rewardVault] = PublicKey.findProgramAddressSync([Buffer.from("reward_vault")], program.programId);

    // Create a TOLL mint (decimals=0) and mint some to admin ATA.
    const tollMint = await createMint(provider.connection, (provider.wallet as any).payer, admin, null, 0);
    const adminAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as any).payer,
      tollMint,
      admin
    );
    await mintTo(provider.connection, (provider.wallet as any).payer, tollMint, adminAta.address, admin, 100_000);

    // Initialize config.
    const nsSetHash = new Uint8Array(32); // placeholder
    const minAttestors = 1;
    const epochLenSlots = new BN(100);
    const rewardPerQuery = new BN(2);
    const maxRewardPerEpoch = new BN(10_000);
    const maxEpochsClaimRange = 32;
    const allowlisted = [admin];

    await program.methods
      .initializeNsConfig(
        epochLenSlots,
        Array.from(nsSetHash),
        minAttestors,
        rewardPerQuery,
        maxRewardPerEpoch,
        maxEpochsClaimRange,
        allowlisted
      )
      .accounts({
        admin,
        nsConfig,
        vaultAuthority,
        tollMint,
        rewardVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Fund reward vault with 50_000.
    await program.methods
      .fundRewards(new BN(50_000))
      .accounts({
        admin,
        nsConfig,
        adminFrom: adminAta.address,
        rewardVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Create claim.
    const domain = normalizeDomain("example.com");
    const dh = domainHash(domain);
    const [nsClaim] = PublicKey.findProgramAddressSync([Buffer.from("ns_claim"), Buffer.from(dh)], program.programId);

    await program.methods
      .createNsClaim(domain, Array.from(dh))
      .accounts({
        nsConfig,
        nsClaim,
        ownerWallet: admin,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Compute epoch id.
    const slot = BigInt(await provider.connection.getSlot("confirmed"));
    const epochId = slot / 100n;
    const epochLe = Buffer.alloc(8);
    epochLe.writeBigUInt64LE(epochId);

    // Submit 1 delegation attestation.
    const [epochAtt] = PublicKey.findProgramAddressSync(
      [Buffer.from("ns_attest"), Buffer.from(dh), epochLe, admin.toBuffer()],
      program.programId
    );
    const controlProofHash = new Uint8Array(32);
    await program.methods
      .submitDelegationAttestation(Array.from(dh), new BN(epochId.toString()), Array.from(controlProofHash), new BN(slot.toString()))
      .accounts({
        nsConfig,
        nsClaim,
        epochAttestation: epochAtt,
        attestor: admin,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Submit usage aggregate for 1000 queries.
    const [epochUsage] = PublicKey.findProgramAddressSync(
      [Buffer.from("ns_usage"), Buffer.from(dh), epochLe],
      program.programId
    );
    const queryCount = 1000;
    const receiptsRoot = new Uint8Array(32);
    await program.methods
      .submitUsageAggregate(
        Array.from(dh),
        new BN(epochId.toString()),
        new BN(queryCount),
        Array.from(receiptsRoot),
        new BN(slot.toString())
      )
      .accounts({
        nsConfig,
        nsClaim,
        epochUsage,
        attestor: admin,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Claim rewards for this epoch.
    const before = await getAccount(provider.connection, adminAta.address);

    const expectedReward = Math.min(10_000, queryCount * 2); // cap vs reward_per_query
    await program.methods
      .claimNsRewards(new BN(epochId.toString()), new BN(epochId.toString()))
      .accounts({
        nsConfig,
        nsClaim,
        ownerWallet: admin,
        rewardVault,
        vaultAuthority,
        ownerTokenAccount: adminAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: epochUsage, isSigner: false, isWritable: false },
        { pubkey: epochAtt, isSigner: false, isWritable: false },
      ])
      .rpc();

    const after = await getAccount(provider.connection, adminAta.address);
    const delta = Number(after.amount - before.amount);
    expect(delta).to.eq(expectedReward);
  });
});

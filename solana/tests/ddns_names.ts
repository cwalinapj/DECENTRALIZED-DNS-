import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";
import crypto from "node:crypto";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\.+$/, "");
}

function hashName(name: string): Buffer {
  return crypto.createHash("sha256").update(normalize(name)).digest();
}

function hashLabel(label: string): Buffer {
  return crypto.createHash("sha256").update(label.trim().toLowerCase()).digest();
}

describe("ddns_names", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const names = anchor.workspace.DdnsNames as Program;

  it("enforces subdomain transfer policy (user.dns non-transferable; premium parent co-sign path)", async () => {
    const feePayer = provider.wallet.publicKey;

    const walletA = Keypair.generate();
    const walletB = Keypair.generate();
    await provider.connection.requestAirdrop(walletA.publicKey, 3e9);
    await provider.connection.requestAirdrop(walletB.publicKey, 3e9);
    await new Promise((r) => setTimeout(r, 1200));

    const [namesConfig] = PublicKey.findProgramAddressSync([Buffer.from("names_config")], names.programId);
    const existingConfig = await names.account.namesConfig.fetchNullable(namesConfig);
    if (!existingConfig) {
      await names.methods
        .initNamesConfig(feePayer, "user.dns", new BN(1_000_000), new BN(0), true, true)
        .accounts({
          config: namesConfig,
          authority: feePayer,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    // alice.user.dns is always non-transferable.
    const userParent = "user.dns";
    const userParentHash = hashName(userParent);
    const aliceLabelHash = hashLabel("alice");
    const [aliceUserPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sub"), userParentHash, aliceLabelHash],
      names.programId
    );
    const [primaryA] = PublicKey.findProgramAddressSync(
      [Buffer.from("primary"), walletA.publicKey.toBuffer()],
      names.programId
    );

    await names.methods
      .claimSubdomain(userParent, "alice", [...userParentHash], [...aliceLabelHash])
      .accounts({
        config: namesConfig,
        treasury: feePayer,
        subName: aliceUserPda,
        primary: primaryA,
        owner: walletA.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([walletA])
      .rpc();

    let nonTransferableFailed = false;
    try {
      await names.methods
        .transferSubdomain(userParent, "alice", [...userParentHash], [...aliceLabelHash])
        .accounts({
          subName: aliceUserPda,
          currentOwner: walletA.publicKey,
          newOwner: walletB.publicKey,
          parentOwner: null,
          parentPolicy: null,
        })
        .signers([walletA])
        .rpc();
    } catch {
      nonTransferableFailed = true;
    }
    expect(nonTransferableFailed).to.equal(true);

    // bob.alice.dns is parent-controlled.
    const aliceDnsHash = hashName("alice.dns");
    const [alicePremiumPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("premium"), aliceDnsHash],
      names.programId
    );
    const [alicePolicyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("parent_policy"), aliceDnsHash],
      names.programId
    );

    await names.methods
      .purchasePremium("alice.dns", [...aliceDnsHash])
      .accounts({
        config: namesConfig,
        treasury: feePayer,
        premiumName: alicePremiumPda,
        parentPolicy: alicePolicyPda,
        primary: primaryA,
        owner: walletA.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([walletA])
      .rpc();

    const bobLabelHash = hashLabel("bob");
    const [bobAlicePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sub"), aliceDnsHash, bobLabelHash],
      names.programId
    );

    await names.methods
      .claimDelegatedSubdomain("alice.dns", "bob", [...aliceDnsHash], [...bobLabelHash], walletB.publicKey)
      .accounts({
        config: namesConfig,
        premiumParent: alicePremiumPda,
        parentPolicy: alicePolicyPda,
        subName: bobAlicePda,
        parentOwner: walletA.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([walletA])
      .rpc();

    const walletC = Keypair.generate();
    await provider.connection.requestAirdrop(walletC.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 800));

    let parentCosignRequired = false;
    try {
      await names.methods
        .transferSubdomain("alice.dns", "bob", [...aliceDnsHash], [...bobLabelHash])
        .accounts({
          subName: bobAlicePda,
          currentOwner: walletB.publicKey,
          newOwner: walletC.publicKey,
          parentOwner: null,
          parentPolicy: alicePolicyPda,
        })
        .signers([walletB])
        .rpc();
    } catch {
      parentCosignRequired = true;
    }
    expect(parentCosignRequired).to.equal(true);

    await names.methods
      .transferSubdomain("alice.dns", "bob", [...aliceDnsHash], [...bobLabelHash])
      .accounts({
        subName: bobAlicePda,
        currentOwner: walletB.publicKey,
        newOwner: walletC.publicKey,
        parentOwner: walletA.publicKey,
        parentPolicy: alicePolicyPda,
      })
      .signers([walletB, walletA])
      .rpc();

    const bobAliceAfter: any = await names.account.subName.fetch(bobAlicePda);
    expect(new PublicKey(bobAliceAfter.owner).equals(walletC.publicKey)).to.equal(true);

    // Premium names remain transferable.
    await names.methods
      .transferPremium()
      .accounts({
        premiumName: alicePremiumPda,
        parentPolicy: alicePolicyPda,
        currentOwner: walletA.publicKey,
        newOwner: walletB.publicKey,
      })
      .signers([walletA])
      .rpc();

    const premiumAfter: any = await names.account.premiumName.fetch(alicePremiumPda);
    expect(new PublicKey(premiumAfter.owner).equals(walletB.publicKey)).to.equal(true);
  });
});

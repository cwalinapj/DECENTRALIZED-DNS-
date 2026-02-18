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

  const P4_LAMPORTS = 100_000n; // 0.0001 SOL
  const R_BPS = 100_000n; // 10x

  async function initConfigOnce(treasuryAuthority: PublicKey) {
    const [namesConfig] = PublicKey.findProgramAddressSync([Buffer.from("names_config")], names.programId);
    const existingConfig = await names.account.namesConfig.fetchNullable(namesConfig);
    if (!existingConfig) {
      await names.methods
        .initNamesConfig(
          treasuryAuthority,
          treasuryAuthority,
          "user.dns",
          new BN(P4_LAMPORTS.toString()),
          new BN(R_BPS.toString()),
          new BN(0),
          true,
          true
        )
        .accounts({
          config: namesConfig,
          authority: treasuryAuthority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
    return namesConfig;
  }

  it("applies premium log pricing + reserves 1-2 char names for treasury authority", async () => {
    const treasuryAuthority = provider.wallet.publicKey;
    const walletA = Keypair.generate();

    await provider.connection.requestAirdrop(walletA.publicKey, 5e9);
    await new Promise((r) => setTimeout(r, 1200));

    const namesConfig = await initConfigOnce(treasuryAuthority);
    // 4-char price: P4
    const fourName = "wxyz.dns";
    const fourHash = hashName(fourName);
    const [fourPremiumPda] = PublicKey.findProgramAddressSync([Buffer.from("premium"), fourHash], names.programId);
    const [fourPolicyPda] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), fourHash], names.programId);
    const [primaryA] = PublicKey.findProgramAddressSync([Buffer.from("primary"), walletA.publicKey.toBuffer()], names.programId);

    await names.methods
      .purchasePremium(fourName, [...fourHash])
      .accounts({
        config: namesConfig,
        treasury: treasuryAuthority,
        premiumName: fourPremiumPda,
        parentPolicy: fourPolicyPda,
        primary: primaryA,
        owner: walletA.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([walletA])
      .rpc();

    // 3-char price: P4 * R
    const threeName = "abc.dns";
    const threeHash = hashName(threeName);
    const [threePremiumPda] = PublicKey.findProgramAddressSync([Buffer.from("premium"), threeHash], names.programId);
    const [threePolicyPda] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), threeHash], names.programId);

    await names.methods
      .purchasePremium(threeName, [...threeHash])
      .accounts({
        config: namesConfig,
        treasury: treasuryAuthority,
        premiumName: threePremiumPda,
        parentPolicy: threePolicyPda,
        primary: primaryA,
        owner: walletA.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([walletA])
      .rpc();

    let reservedTwoFailed = false;
    try {
      const twoName = "ab.dns";
      const twoHash = hashName(twoName);
      const [twoPremiumPda] = PublicKey.findProgramAddressSync([Buffer.from("premium"), twoHash], names.programId);
      const [twoPolicyPda] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), twoHash], names.programId);
      await names.methods
        .purchasePremium(twoName, [...twoHash])
        .accounts({
          config: namesConfig,
          treasury: treasuryAuthority,
          premiumName: twoPremiumPda,
          parentPolicy: twoPolicyPda,
          primary: primaryA,
          owner: walletA.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([walletA])
        .rpc();
    } catch {
      reservedTwoFailed = true;
    }
    expect(reservedTwoFailed).to.equal(true);

    let reservedOneFailed = false;
    try {
      const oneName = "z.dns";
      const oneHash = hashName(oneName);
      const [onePremiumPda] = PublicKey.findProgramAddressSync([Buffer.from("premium"), oneHash], names.programId);
      const [onePolicyPda] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), oneHash], names.programId);
      await names.methods
        .purchasePremium(oneName, [...oneHash])
        .accounts({
          config: namesConfig,
          treasury: treasuryAuthority,
          premiumName: onePremiumPda,
          parentPolicy: onePolicyPda,
          primary: primaryA,
          owner: walletA.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([walletA])
        .rpc();
    } catch {
      reservedOneFailed = true;
    }
    expect(reservedOneFailed).to.equal(true);

    // Treasury authority can mint reserved 2-char name.
    const twoNameTreasury = "aa.dns";
    const twoHashTreasury = hashName(twoNameTreasury);
    const [twoPremiumPdaTreasury] = PublicKey.findProgramAddressSync([Buffer.from("premium"), twoHashTreasury], names.programId);
    const [twoPolicyPdaTreasury] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), twoHashTreasury], names.programId);
    const [primaryTreasury] = PublicKey.findProgramAddressSync(
      [Buffer.from("primary"), treasuryAuthority.toBuffer()],
      names.programId
    );
    await names.methods
      .purchasePremium(twoNameTreasury, [...twoHashTreasury])
      .accounts({
        config: namesConfig,
        treasury: treasuryAuthority,
        premiumName: twoPremiumPdaTreasury,
        parentPolicy: twoPolicyPdaTreasury,
        primary: primaryTreasury,
        owner: treasuryAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Treasury authority can mint reserved 1-char name.
    const oneNameTreasury = "q.dns";
    const oneHashTreasury = hashName(oneNameTreasury);
    const [onePremiumPdaTreasury] = PublicKey.findProgramAddressSync([Buffer.from("premium"), oneHashTreasury], names.programId);
    const [onePolicyPdaTreasury] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), oneHashTreasury], names.programId);
    await names.methods
      .purchasePremium(oneNameTreasury, [...oneHashTreasury])
      .accounts({
        config: namesConfig,
        treasury: treasuryAuthority,
        premiumName: onePremiumPdaTreasury,
        parentPolicy: onePolicyPdaTreasury,
        primary: primaryTreasury,
        owner: treasuryAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const fourPremium: any = await names.account.premiumName.fetch(fourPremiumPda);
    const threePremium: any = await names.account.premiumName.fetch(threePremiumPda);
    const twoPremium: any = await names.account.premiumName.fetch(twoPremiumPdaTreasury);
    const onePremium: any = await names.account.premiumName.fetch(onePremiumPdaTreasury);

    expect(BigInt(fourPremium.purchaseLamports.toString())).to.equal(P4_LAMPORTS);
    expect(BigInt(threePremium.purchaseLamports.toString())).to.equal(P4_LAMPORTS * 10n);
    expect(BigInt(twoPremium.purchaseLamports.toString())).to.equal(P4_LAMPORTS * 100n);
    expect(BigInt(onePremium.purchaseLamports.toString())).to.equal(P4_LAMPORTS * 1000n);
  });

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
        .initNamesConfig(
          feePayer,
          feePayer,
          "user.dns",
          new BN(P4_LAMPORTS.toString()),
          new BN(R_BPS.toString()),
          new BN(0),
          true,
          true
        )
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
    const [primaryA] = PublicKey.findProgramAddressSync([Buffer.from("primary"), walletA.publicKey.toBuffer()], names.programId);

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
    const [alicePremiumPda] = PublicKey.findProgramAddressSync([Buffer.from("premium"), aliceDnsHash], names.programId);
    const [alicePolicyPda] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), aliceDnsHash], names.programId);

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
    const [bobAlicePda] = PublicKey.findProgramAddressSync([Buffer.from("sub"), aliceDnsHash, bobLabelHash], names.programId);

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

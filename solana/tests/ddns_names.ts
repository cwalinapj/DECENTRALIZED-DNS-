import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";
import crypto from "node:crypto";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "../scripts/lib/token.js";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\.+$/, "");
}

function hashName(name: string): Buffer {
  return crypto.createHash("sha256").update(normalize(name)).digest();
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function createSplTransferInstruction(source: PublicKey, destination: PublicKey, authority: PublicKey, amount: bigint) {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0);
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

describe("ddns_names premium auctions", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const names = anchor.workspace.DdnsNames as Program;

  it("enforces 3-4 char auction flow; reserves <=2 to treasury; keeps >=5 normal path", async () => {
    const authority = provider.wallet.publicKey;
    const bidder1 = Keypair.generate();
    const bidder2 = Keypair.generate();
    await provider.connection.requestAirdrop(bidder1.publicKey, 5e9);
    await provider.connection.requestAirdrop(bidder2.publicKey, 5e9);
    await sleep(1500);

    const [namesConfig] = PublicKey.findProgramAddressSync([Buffer.from("names_config")], names.programId);
    const [premiumConfig] = PublicKey.findProgramAddressSync([Buffer.from("premium_config")], names.programId);

    if (!(await names.account.namesConfig.fetchNullable(namesConfig))) {
      await names.methods
        .initNamesConfig(authority, "user.dns", new BN(100_000_000), new BN(0), true, true)
        .accounts({
          config: namesConfig,
          authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    if (!(await names.account.premiumConfig.fetchNullable(premiumConfig))) {
      await names.methods
        .initPremiumConfig(authority, authority, new BN(50_000_000), new BN(2), new BN(0), true)
        .accounts({
          premiumConfig,
          authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const token = bidder1.publicKey
      .toBase58()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 6);

    // L>=5 stays normal premium path.
    const longName = `${token.slice(0, 5)}.dns`;
    const longHash = hashName(longName);
    const [longPremium] = PublicKey.findProgramAddressSync([Buffer.from("premium"), longHash], names.programId);
    const [longPolicy] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), longHash], names.programId);
    const [authPrimary] = PublicKey.findProgramAddressSync([Buffer.from("primary"), authority.toBuffer()], names.programId);
    await names.methods
      .purchasePremium(longName, [...longHash])
      .accounts({
        config: namesConfig,
        premiumConfig,
        treasury: authority,
        premiumName: longPremium,
        parentPolicy: longPolicy,
        primary: authPrimary,
        owner: authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // L=3 blocked on normal path (auction required).
    const threeName = `${token.slice(0, 3)}.dns`;
    const threeHash = hashName(threeName);
    const [threePremium] = PublicKey.findProgramAddressSync([Buffer.from("premium"), threeHash], names.programId);
    const [threePolicy] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), threeHash], names.programId);
    let auctionRequired = false;
    try {
      await names.methods
        .purchasePremium(threeName, [...threeHash])
        .accounts({
          config: namesConfig,
          premiumConfig,
          treasury: authority,
          premiumName: threePremium,
          parentPolicy: threePolicy,
          primary: authPrimary,
          owner: authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch {
      auctionRequired = true;
    }
    expect(auctionRequired).to.equal(true);

    // Reserve <=2 for treasury authority.
    const twoName = `${token.slice(0, 2)}.dns`;
    const twoHash = hashName(twoName);
    const [twoPremium] = PublicKey.findProgramAddressSync([Buffer.from("premium"), twoHash], names.programId);
    const [twoPolicy] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), twoHash], names.programId);
    const [bidder1Primary] = PublicKey.findProgramAddressSync([Buffer.from("primary"), bidder1.publicKey.toBuffer()], names.programId);
    let reservedFailed = false;
    try {
      await names.methods
        .purchasePremium(twoName, [...twoHash])
        .accounts({
          config: namesConfig,
          premiumConfig,
          treasury: authority,
          premiumName: twoPremium,
          parentPolicy: twoPolicy,
          primary: bidder1Primary,
          owner: bidder1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([bidder1])
        .rpc();
    } catch {
      reservedFailed = true;
    }
    expect(reservedFailed).to.equal(true);

    // Treasury authority can still mint <=2.
    await names.methods
      .purchasePremium(twoName, [...twoHash])
      .accounts({
        config: namesConfig,
        premiumConfig,
        treasury: authority,
        premiumName: twoPremium,
        parentPolicy: twoPolicy,
        primary: authPrimary,
        owner: authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Auction flow for 3-char.
    const [auctionPda] = PublicKey.findProgramAddressSync([Buffer.from("auction"), threeHash], names.programId);
    await names.methods
      .createAuction(threeName, [...threeHash], new BN(10_000_000), new BN(10))
      .accounts({
        premiumConfig,
        auction: auctionPda,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const [escrow1] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), threeHash, bidder1.publicKey.toBuffer()],
      names.programId
    );
    const [escrowVault1] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_vault"), threeHash, bidder1.publicKey.toBuffer()],
      names.programId
    );
    const [escrow2] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), threeHash, bidder2.publicKey.toBuffer()],
      names.programId
    );
    const [escrowVault2] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_vault"), threeHash, bidder2.publicKey.toBuffer()],
      names.programId
    );

    await names.methods
      .placeBid([...threeHash], new BN(11_000_000))
      .accounts({
        premiumConfig,
        auction: auctionPda,
        bidEscrow: escrow1,
        escrowVault: escrowVault1,
        bidder: bidder1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bidder1])
      .rpc();

    await names.methods
      .placeBid([...threeHash], new BN(12_000_000))
      .accounts({
        premiumConfig,
        auction: auctionPda,
        bidEscrow: escrow2,
        escrowVault: escrowVault2,
        bidder: bidder2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bidder2])
      .rpc();

    await sleep(15000);
    const [bidder2Primary] = PublicKey.findProgramAddressSync([Buffer.from("primary"), bidder2.publicKey.toBuffer()], names.programId);
    await names.methods
      .settleAuction([...threeHash])
      .accounts({
        config: namesConfig,
        premiumConfig,
        auction: auctionPda,
        winnerEscrow: escrow2,
        winnerEscrowVault: escrowVault2,
        treasury: authority,
        premiumName: threePremium,
        parentPolicy: threePolicy,
        primary: bidder2Primary,
        winner: bidder2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([bidder2])
      .rpc();

    const threePremiumAcct: any = await names.account.premiumName.fetch(threePremium);
    expect(new PublicKey(threePremiumAcct.owner).equals(bidder2.publicKey)).to.equal(true);
  });

  it("binds premium ownership to an NFT holder wallet", async () => {
    const authority = provider.wallet.publicKey;
    const payer = (provider.wallet as any).payer;
    const owner = Keypair.generate();
    const newOwner = Keypair.generate();
    await provider.connection.requestAirdrop(owner.publicKey, 3e9);
    await provider.connection.requestAirdrop(newOwner.publicKey, 3e9);
    await sleep(1500);

    const [namesConfig] = PublicKey.findProgramAddressSync([Buffer.from("names_config")], names.programId);
    const [premiumConfig] = PublicKey.findProgramAddressSync([Buffer.from("premium_config")], names.programId);

    if (!(await names.account.namesConfig.fetchNullable(namesConfig))) {
      await names.methods
        .initNamesConfig(authority, "user.dns", new BN(100_000_000), new BN(0), true, true)
        .accounts({
          config: namesConfig,
          authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    if (!(await names.account.premiumConfig.fetchNullable(premiumConfig))) {
      await names.methods
        .initPremiumConfig(authority, authority, new BN(50_000_000), new BN(2), new BN(0), true)
        .accounts({
          premiumConfig,
          authority,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const token = owner.publicKey
      .toBase58()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 6);
    const name = `${token.slice(0, 5)}.dns`;
    const nameHash = hashName(name);
    const [premiumPda] = PublicKey.findProgramAddressSync([Buffer.from("premium"), nameHash], names.programId);
    const [policyPda] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), nameHash], names.programId);
    const [ownerPrimary] = PublicKey.findProgramAddressSync([Buffer.from("primary"), owner.publicKey.toBuffer()], names.programId);

    await names.methods
      .purchasePremium(name, [...nameHash])
      .accounts({
        config: namesConfig,
        premiumConfig,
        treasury: authority,
        premiumName: premiumPda,
        parentPolicy: policyPda,
        primary: ownerPrimary,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const nftMint = await createMint(provider.connection, payer, authority, null, 0);
    const ownerAta = await getOrCreateAssociatedTokenAccount(provider.connection, payer, nftMint, owner.publicKey);
    const newOwnerAta = await getOrCreateAssociatedTokenAccount(provider.connection, payer, nftMint, newOwner.publicKey);
    await mintTo(provider.connection, payer, nftMint, ownerAta.address, payer, 1n);

    await names.methods
      .bindPremiumNft()
      .accounts({
        premiumName: premiumPda,
        parentPolicy: policyPda,
        nftMint,
        ownerNftAccount: ownerAta.address,
        currentOwner: owner.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    let transferBlocked = false;
    try {
      await names.methods
        .transferPremium()
        .accounts({
          premiumName: premiumPda,
          parentPolicy: policyPda,
          currentOwner: owner.publicKey,
          newOwner: newOwner.publicKey,
        })
        .signers([owner])
        .rpc();
    } catch {
      transferBlocked = true;
    }
    expect(transferBlocked).to.equal(true);

    await provider.sendAndConfirm(
      new Transaction().add(createSplTransferInstruction(ownerAta.address, newOwnerAta.address, owner.publicKey, 1n)),
      [owner]
    );

    await names.methods
      .syncPremiumOwnerFromNft()
      .accounts({
        premiumName: premiumPda,
        parentPolicy: policyPda,
        nftMint,
        holderNftAccount: newOwnerAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const premiumAcct: any = await names.account.premiumName.fetch(premiumPda);
    const policyAcct: any = await names.account.parentPolicy.fetch(policyPda);
    expect(new PublicKey(premiumAcct.owner).equals(newOwner.publicKey)).to.equal(true);
    expect(new PublicKey(policyAcct.parentOwner).equals(newOwner.publicKey)).to.equal(true);
    expect(new PublicKey(premiumAcct.nftMint).equals(nftMint)).to.equal(true);
    expect(premiumAcct.nftBound).to.equal(true);
  });
});

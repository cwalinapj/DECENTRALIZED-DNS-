import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Ed25519Program,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createAccount,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import crypto from "node:crypto";
import { expect } from "chai";
import nacl from "tweetnacl";

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function encodeVoucherV1(args: {
  payer: PublicKey;
  nameHash: Buffer;
  amount: bigint;
  mint: PublicKey;
  nonce: bigint;
  validAfterSlot: bigint;
  expiresAtSlot: bigint;
  contextHash: Buffer;
}): Buffer {
  return Buffer.concat([
    Buffer.from([1]), // version
    Buffer.from([0]), // voucher_type = 0 (toll)
    args.payer.toBuffer(),
    args.nameHash,
    u64le(args.amount),
    args.mint.toBuffer(),
    u64le(args.nonce),
    u64le(args.validAfterSlot),
    u64le(args.expiresAtSlot),
    args.contextHash,
  ]);
}

function voucherMessage(voucherBytes: Buffer): Buffer {
  return sha256(Buffer.concat([Buffer.from("DDNS_VOUCHER_V1", "utf8"), voucherBytes]));
}

describe("ddns_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DdnsEscrow as Program;

  it("redeems a toll voucher and splits payouts; rejects replay and wrong signer", async () => {
    const feePayer = provider.wallet.publicKey;
    const feePayerKp = (provider.wallet as any).payer as Keypair;

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_config")],
      program.programId
    );

    // Config is a singleton PDA; reuse if it exists (delta-based asserts).
    const cfgInfo = await provider.connection.getAccountInfo(configPda);
    let tollMint: PublicKey;
    let minersVault: PublicKey;
    let treasuryVault: PublicKey;
    if (!cfgInfo) {
      tollMint = await createMint(
        provider.connection,
        feePayerKp,
        feePayer,
        null,
        9
      );
      minersVault = await createAccount(
        provider.connection,
        feePayerKp,
        tollMint,
        feePayer,
        Keypair.generate()
      );
      treasuryVault = await createAccount(
        provider.connection,
        feePayerKp,
        tollMint,
        feePayer,
        Keypair.generate()
      );

      await program.methods
        .initConfig(
          feePayer,
          tollMint,
          minersVault,
          treasuryVault,
          1000,
          2000,
          7000,
          [feePayer] // allowlisted signer for vouchers
        )
        .accounts({
          config: configPda,
          tollMint,
          minersVault,
          treasuryVault,
          payer: feePayer,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } else {
      const cfg = await program.account.escrowConfig.fetch(configPda);
      tollMint = new PublicKey(cfg.tollMint);
      minersVault = new PublicKey(cfg.minersVault);
      treasuryVault = new PublicKey(cfg.treasuryVault);
    }

    // Create user escrow and deposit
    const user = Keypair.generate();
    await provider.connection.requestAirdrop(user.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 1200));

    const userAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      feePayerKp,
      tollMint,
      user.publicKey
    );
    await mintTo(
      provider.connection,
      feePayerKp,
      tollMint,
      userAta.address,
      feePayer,
      100n * 10n ** 9n
    );

    const [userEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), user.publicKey.toBuffer()],
      program.programId
    );
    const vault = await createAccount(
      provider.connection,
      feePayerKp,
      tollMint,
      userEscrowPda,
      Keypair.generate()
    );

    await program.methods
      .initUserEscrow()
      .accounts({
        config: configPda,
        userEscrow: userEscrowPda,
        vault,
        tollMint,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    await program.methods
      .deposit(new BN((100n * 10n ** 9n).toString()))
      .accounts({
        config: configPda,
        userEscrow: userEscrowPda,
        userAta: userAta.address,
        vault,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    // Register a domain owner (random name to avoid collisions)
    const owner = Keypair.generate();
    await provider.connection.requestAirdrop(owner.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 1200));

    const ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      feePayerKp,
      tollMint,
      owner.publicKey
    );

    const name = `example-${Math.floor(Math.random() * 1e9)}.dns`;
    const nameHash = sha256(Buffer.from(name, "utf8"));
    const [domainOwnerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("domain_owner"), nameHash],
      program.programId
    );

    await program.methods
      .registerDomainOwner(Array.from(nameHash), owner.publicKey, ownerAta.address)
      .accounts({
        config: configPda,
        domainOwner: domainOwnerPda,
        payoutTokenAccount: ownerAta.address,
        ownerWallet: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    // Issue voucher
    const amount = 10n * 10n ** 9n;
    const nonce = BigInt(Math.floor(Math.random() * 1e9) + 1);
    const slot = await provider.connection.getSlot("confirmed");
    const voucherBytes = encodeVoucherV1({
      payer: user.publicKey,
      nameHash,
      amount,
      mint: tollMint,
      nonce,
      validAfterSlot: 0n,
      expiresAtSlot: BigInt(slot + 10_000),
      contextHash: Buffer.alloc(32, 7),
    });
    const msg = voucherMessage(voucherBytes);
    const sig = nacl.sign.detached(new Uint8Array(msg), feePayerKp.secretKey);

    const nonceLe = u64le(nonce);
    const redeemSeed = sha256(Buffer.concat([user.publicKey.toBuffer(), nonceLe]));

    // Derive redeemed PDA from the exact bytes we pass as the `redeem_seed` arg.
    // This guards against subtle serialization mismatches and keeps the test self-diagnostic.
    const redeemSeedArg = Buffer.from(redeemSeed);
    const [redeemedPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("redeemed"), user.publicKey.toBuffer(), redeemSeedArg],
      program.programId
    );

    const edIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: feePayer.toBytes(),
      message: msg,
      signature: sig,
    });

    const redeemIx = await program.methods
      .redeemTollVoucher(
        voucherBytes,
        Array.from(Buffer.from(sig)) as any,
        new BN(nonce.toString()),
        Array.from(redeemSeedArg) as any
      )
      .accounts({
        config: configPda,
        voucherPayer: user.publicKey,
        userEscrow: userEscrowPda,
        payerVault: vault,
        domainOwner: domainOwnerPda,
        domainOwnerAta: ownerAta.address,
        minersVault,
        treasuryVault,
        redeemedVoucher: redeemedPda,
        feePayer,
        sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();

    const minersStart = (await getAccount(provider.connection, minersVault)).amount;
    const treasuryStart = (await getAccount(provider.connection, treasuryVault)).amount;
    const ownerStart = (await getAccount(provider.connection, ownerAta.address)).amount;

    await provider.sendAndConfirm(new Transaction().add(edIx).add(redeemIx));

    const ownerEnd = (await getAccount(provider.connection, ownerAta.address)).amount;
    const minersEnd = (await getAccount(provider.connection, minersVault)).amount;
    const treasuryEnd = (await getAccount(provider.connection, treasuryVault)).amount;

    expect(ownerEnd - ownerStart).to.equal(1n * 10n ** 9n);
    expect(minersEnd - minersStart).to.equal(2n * 10n ** 9n);
    expect(treasuryEnd - treasuryStart).to.equal(7n * 10n ** 9n);

    // Replay must fail (redeemed PDA already exists).
    let replayOk = false;
    try {
      await provider.sendAndConfirm(new Transaction().add(edIx).add(redeemIx));
      replayOk = true;
    } catch {
      // expected
    }
    expect(replayOk).to.equal(false);

    // Wrong signer must fail (not allowlisted) using a fresh nonce + redeemed PDA.
    const nonce2 = nonce + 1n;
    const voucherBytes2 = encodeVoucherV1({
      payer: user.publicKey,
      nameHash,
      amount,
      mint: tollMint,
      nonce: nonce2,
      validAfterSlot: 0n,
      expiresAtSlot: BigInt(slot + 10_000),
      contextHash: Buffer.alloc(32, 9),
    });
    const msg2 = voucherMessage(voucherBytes2);
    const badSigner = Keypair.generate();
    const badSig = nacl.sign.detached(new Uint8Array(msg2), badSigner.secretKey);

    const nonce2Le = u64le(nonce2);
    const redeemSeed2 = sha256(Buffer.concat([user.publicKey.toBuffer(), nonce2Le]));
    const [redeemedPda2] = PublicKey.findProgramAddressSync(
      [Buffer.from("redeemed"), user.publicKey.toBuffer(), redeemSeed2],
      program.programId
    );

    const badEdIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: badSigner.publicKey.toBytes(),
      message: msg2,
      signature: badSig,
    });

    const badRedeemIx = await program.methods
      .redeemTollVoucher(
        voucherBytes2,
        Array.from(Buffer.from(badSig)) as any,
        new BN(nonce2.toString()),
        Array.from(redeemSeed2) as any
      )
      .accounts({
        config: configPda,
        voucherPayer: user.publicKey,
        userEscrow: userEscrowPda,
        payerVault: vault,
        domainOwner: domainOwnerPda,
        domainOwnerAta: ownerAta.address,
        minersVault,
        treasuryVault,
        redeemedVoucher: redeemedPda2,
        feePayer,
        sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();

    let badOk = false;
    try {
      await provider.sendAndConfirm(new Transaction().add(badEdIx).add(badRedeemIx));
      badOk = true;
    } catch {
      // expected
    }
    expect(badOk).to.equal(false);
  });
});

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";
import crypto from "node:crypto";

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function nameHash(name: string): Buffer {
  const n = name.trim().toLowerCase().replace(/\.$/, "");
  return sha256(Buffer.from(n, "utf8"));
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

async function waitForSlot(conn: any, minSlot: number) {
  for (let i = 0; i < 60; i++) {
    const s = await conn.getSlot("confirmed");
    if (s >= minSlot) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout waiting for slot >= ${minSlot}`);
}

async function waitForEpoch(conn: any, epochLenSlots: number, targetEpoch: bigint) {
  for (let i = 0; i < 80; i++) {
    const slot = BigInt(await conn.getSlot("confirmed"));
    const epoch = slot / BigInt(epochLenSlots);
    if (epoch >= targetEpoch) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout waiting for epoch >= ${targetEpoch.toString()}`);
}

describe("ddns_watchdog_policy", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DdnsWatchdogPolicy as Program;

  it("transitions OK -> WARN -> QUARANTINE based on distinct watchdog attestations", async () => {
    const feePayer = provider.wallet.publicKey;

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("policy_config")],
      program.programId
    );

    const w1 = Keypair.generate();
    const w2 = Keypair.generate();
    const w3 = Keypair.generate();

    const epochLenSlots = 10;
    await program.methods
      .initPolicyConfig({
        epochLenSlots: new BN(epochLenSlots),
        attestationMaxAgeSecs: 3600,
        minWatchdogs: 2,
        warnThresholdBps: 2000,
        quarantineThresholdBps: 8000,
        allowlistedWatchdogs: [w1.publicKey, w2.publicKey, w3.publicKey],
        allowlistedSubmitters: [feePayer],
      })
      .accounts({
        config: configPda,
        authority: feePayer,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Enable watchdogs.
    for (const w of [w1, w2, w3]) {
      const [ws] = PublicKey.findProgramAddressSync(
        [Buffer.from("watchdog"), w.publicKey.toBuffer()],
        program.programId
      );
      await program.methods
        .setWatchdogEnabled(w.publicKey, true)
        .accounts({
          config: configPda,
          watchdog: w.publicKey,
          watchdogState: ws,
          authority: feePayer,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    const name = `example-${Math.floor(Math.random() * 1e9)}.dns`;
    const nh = nameHash(name);
    const [namePolicyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("name_policy"), nh],
      program.programId
    );

    const cfg: any = await program.account.policyConfig.fetch(configPda);
    const epochLen = BigInt(cfg.epochLenSlots.toString());
    // Start near the beginning of an epoch to reduce flakiness.
    for (;;) {
      const s = BigInt(await provider.connection.getSlot("confirmed"));
      if ((s % epochLen) <= 2n) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const slot0 = BigInt(await provider.connection.getSlot("confirmed"));
    const epochId0 = slot0 / epochLen;

    const root = Buffer.alloc(32, 1);
    const rrsetHash = Buffer.alloc(32, 2);
    const now = Math.floor(Date.now() / 1000);

    async function submitIx(epochId: bigint, w: PublicKey, kind: number, outcome: number) {
      const [ws] = PublicKey.findProgramAddressSync(
        [Buffer.from("watchdog"), w.toBuffer()],
        program.programId
      );
      const [log] = PublicKey.findProgramAddressSync(
        [Buffer.from("attest_log"), u64le(epochId), nh],
        program.programId
      );
      const [mark] = PublicKey.findProgramAddressSync(
        [Buffer.from("attest_mark"), u64le(epochId), nh, w.toBuffer()],
        program.programId
      );

      return program.methods
        .submitAttestationDigest(
          new BN(epochId.toString()),
          Array.from(nh) as any,
          kind,
          outcome,
          0,
          10000,
          Array.from(rrsetHash) as any,
          new BN(now),
          Array.from(root) as any
        )
        .accounts({
          config: configPda,
          watchdog: w,
          watchdogState: ws,
          namePolicyState: namePolicyPda,
          attestLog: log,
          attestMark: mark,
          submitter: feePayer,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();
    }

    // 2 OK resolves -> stays OK
    await provider.sendAndConfirm(
      new Transaction()
        .add(await submitIx(epochId0, w1.publicKey, 1, 0))
        .add(await submitIx(epochId0, w2.publicKey, 1, 0))
    );
    let st: any = await program.account.namePolicyState.fetch(namePolicyPda);
    expect(st.status).to.equal(0);
    expect(st.penaltyBps).to.equal(0);

    // 2 failures -> WARN
    await provider.sendAndConfirm(
      new Transaction()
        .add(await submitIx(epochId0, w1.publicKey, 1, 4 /* TLS_FAIL */))
        .add(await submitIx(epochId0, w2.publicKey, 1, 3 /* TIMEOUT */))
    );
    st = await program.account.namePolicyState.fetch(namePolicyPda);
    expect(st.status).to.equal(1);
    expect(st.penaltyBps).to.equal(500);
    expect(st.recommendedTtlCap).to.equal(300);

    // 2 censorship mismatches -> QUARANTINE
    await provider.sendAndConfirm(
      new Transaction()
        .add(await submitIx(epochId0, w1.publicKey, 2, 0))
        .add(await submitIx(epochId0, w2.publicKey, 2, 0))
    );
    st = await program.account.namePolicyState.fetch(namePolicyPda);
    expect(st.status).to.equal(2);
    expect(st.penaltyBps).to.equal(2500);
    expect(st.recommendedTtlCap).to.equal(60);

    // Epoch separation: wait for next epoch and ensure rolling counters reset on next submission.
    await waitForEpoch(provider.connection, epochLenSlots, epochId0 + 1n);
    const slot1 = BigInt(await provider.connection.getSlot("confirmed"));
    const epochId1 = slot1 / epochLen;
    await provider.sendAndConfirm(
      new Transaction().add(await submitIx(epochId1, w1.publicKey, 1, 0))
    );
    st = await program.account.namePolicyState.fetch(namePolicyPda);
    expect(st.lastEpochId.toString()).to.equal(epochId1.toString());
    expect(st.rollingOk).to.equal(1);
    expect(st.rollingFail).to.equal(0);
    expect(st.rollingMismatch).to.equal(0);
  });
});

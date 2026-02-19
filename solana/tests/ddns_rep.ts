import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

describe("ddns_rep", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.DdnsRep as Program;

  it("awards non-transferable REP points with caps", async () => {
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_config")], program.programId);
    await program.methods
      .initRepConfig(new BN(100), new BN(10), 12000, 10000, 7000, new BN(500), 2, 1)
      .accounts({ config: configPda, authority: provider.wallet.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
      .rpc();

    const epochId = 7n;
    const contributor = provider.wallet.publicKey;
    const [repPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("rep_epoch"), u64le(epochId), contributor.toBuffer()],
      program.programId
    );

    await program.methods
      .awardRep(new BN(epochId.toString()), contributor, 20, 3, 1, 2)
      .accounts({ config: configPda, epochRep: repPda, authority: provider.wallet.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
      .rpc();

    const account: any = await program.account.epochRep.fetch(repPda);
    expect(Number(account.acceptedEntries)).to.equal(20);
    expect(Number(account.repPoints)).to.be.greaterThan(0);

    // second award clamps at daily cap
    await program.methods
      .awardRep(new BN(epochId.toString()), contributor, 200, 3, 2, 2)
      .accounts({ config: configPda, epochRep: repPda, authority: provider.wallet.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
      .rpc();

    const after: any = await program.account.epochRep.fetch(repPda);
    expect(Number(after.repPoints)).to.equal(500);
  });
});

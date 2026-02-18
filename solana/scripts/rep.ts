import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

function loadKeypair(filePath: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8"))));
}

function readProgramIdFromAnchorToml(rpcUrl: string): string | null {
  const p = path.resolve("Anchor.toml");
  if (!fs.existsSync(p)) return null;
  const content = fs.readFileSync(p, "utf8");
  const section = /localhost|127\.0\.0\.1/.test(rpcUrl) ? "programs.localnet" : "programs.devnet";
  const re = new RegExp(`\\[${section}\\][^\\[]*?ddns_rep\\s*=\\s*\"([^\"]+)\"`, "s");
  const m = content.match(re);
  return m ? m[1] : null;
}

function loadIdl() {
  const p = path.resolve("target/idl/ddns_rep.json");
  if (!fs.existsSync(p)) throw new Error(`IDL missing at ${p}. Run anchor build first.`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function sha256Hex(s: string): Buffer {
  return crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest();
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command("init-config", "init rep config", (y) =>
      y
        .option("epoch-len-slots", { type: "number", default: 100 })
        .option("daily-cap", { type: "string", default: "1000" })
        .option("min-bond-lamports", { type: "string", default: "10000000" })
        .option("min-unique-names", { type: "number", default: 3 })
        .option("min-unique-colos", { type: "number", default: 1 })
        .option("rep-per-aggregate", { type: "string", default: "20" })
        .option("rep-decay-per-epoch", { type: "string", default: "0" })
        .option("cooldown-slots", { type: "string", default: "150" })
        .option("enabled", { type: "boolean", default: true })
    )
    .command("deposit-bond", "deposit SOL bond", (y) => y.option("amount", { type: "string", demandOption: true }))
    .command("withdraw-bond", "withdraw SOL bond", (y) => y.option("amount", { type: "string", demandOption: true }))
    .command("award", "submit aggregate for REP", (y) =>
      y
        .option("epoch", { type: "number", demandOption: true })
        .option("root", { type: "string", describe: "hex32; default sha256(now)" })
        .option("receipt-count", { type: "number", default: 100 })
        .option("unique-names", { type: "number", default: 3 })
        .option("unique-colos", { type: "number", default: 1 })
    )
    .command("status", "show config + bond + rep")
    .option("rpc", { type: "string", default: process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com" })
    .option("wallet", { type: "string", default: process.env.ANCHOR_WALLET || path.join(process.env.HOME || ".", ".config/solana/id.json") })
    .option("program-id", { type: "string", default: process.env.DDNS_REP_PROGRAM_ID || "" })
    .demandCommand(1)
    .strict()
    .parse();

  const wallet = loadKeypair(argv.wallet as string);
  const connection = new anchor.web3.Connection(argv.rpc as string, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = loadIdl();
  const pid = (argv["program-id"] as string) || readProgramIdFromAnchorToml(argv.rpc as string);
  if (!pid) throw new Error("set --program-id or DDNS_REP_PROGRAM_ID");
  const programId = new PublicKey(pid);
  const program = new anchor.Program(idl as any, programId, provider);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_config")], programId);
  const [bondPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_bond"), wallet.publicKey.toBuffer()], programId);
  const [repPda] = PublicKey.findProgramAddressSync([Buffer.from("miner_rep"), wallet.publicKey.toBuffer()], programId);

  const cmd = argv._[0];

  if (cmd === "init-config") {
    const sig = await program.methods
      .initRepConfig(
        new BN(argv["epoch-len-slots"] as number),
        new BN(argv["daily-cap"] as string),
        new BN(argv["min-bond-lamports"] as string),
        argv["min-unique-names"] as number,
        argv["min-unique-colos"] as number,
        new BN(argv["rep-per-aggregate"] as string),
        new BN(argv["rep-decay-per-epoch"] as string),
        new BN(argv["cooldown-slots"] as string),
        Boolean(argv.enabled)
      )
      .accounts({ authority: wallet.publicKey, config: configPda, systemProgram: SystemProgram.programId })
      .signers([wallet])
      .rpc();
    console.log(JSON.stringify({ tx: sig, programId: programId.toBase58(), configPda: configPda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "deposit-bond") {
    const sig = await program.methods
      .depositRepBond(new BN(argv.amount as string))
      .accounts({ miner: wallet.publicKey, config: configPda, bond: bondPda, systemProgram: SystemProgram.programId })
      .signers([wallet])
      .rpc();
    console.log(JSON.stringify({ tx: sig, bondPda: bondPda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "withdraw-bond") {
    const sig = await program.methods
      .withdrawRepBond(new BN(argv.amount as string))
      .accounts({ miner: wallet.publicKey, config: configPda, bond: bondPda })
      .signers([wallet])
      .rpc();
    console.log(JSON.stringify({ tx: sig, bondPda: bondPda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "award") {
    const root = argv.root ? Buffer.from(String(argv.root), "hex") : sha256Hex(String(Date.now()));
    if (root.length !== 32) throw new Error("root must be 32-byte hex");
    const sig = await program.methods
      .awardRep(
        new BN(argv.epoch as number),
        [...root],
        argv["receipt-count"] as number,
        argv["unique-names"] as number,
        argv["unique-colos"] as number
      )
      .accounts({ miner: wallet.publicKey, config: configPda, bond: bondPda, rep: repPda, systemProgram: SystemProgram.programId })
      .signers([wallet])
      .rpc();
    console.log(JSON.stringify({ tx: sig, repPda: repPda.toBase58(), root: root.toString("hex") }, null, 2));
    return;
  }

  const config = await program.account.repConfig.fetchNullable(configPda);
  const bond = await program.account.minerBond.fetchNullable(bondPda);
  const rep = await program.account.minerRep.fetchNullable(repPda);
  console.log(JSON.stringify({ configPda: configPda.toBase58(), bondPda: bondPda.toBase58(), repPda: repPda.toBase58(), config, bond, rep }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

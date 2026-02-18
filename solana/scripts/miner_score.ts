import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdl() {
  const idlPath = path.resolve("target/idl/ddns_miner_score.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error(`IDL not found at ${idlPath}. Run 'anchor build' in /solana first.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
}

function readProgramIdFromAnchorToml(rpcUrl: string): string | null {
  try {
    const tomlPath = path.resolve("Anchor.toml");
    if (!fs.existsSync(tomlPath)) return null;
    const content = fs.readFileSync(tomlPath, "utf8");
    const isLocal = /127\\.0\\.0\\.1|localhost/.test(rpcUrl);
    const section = isLocal ? "programs.localnet" : "programs.devnet";
    const re = new RegExp(
      `\\[${section}\\][^\\[]*?ddns_miner_score\\s*=\\s*\"([^\"]+)\"`,
      "s"
    );
    const match = content.match(re);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command("init-config", "Init miner score config + reward vault", (y) =>
      y
        .option("epoch-len-slots", { type: "number", default: 100 })
        .option("base-reward", { type: "string", default: "0" })
        .option("cap", { type: "string", default: "0" })
        .option("min-stake-weight", { type: "string", default: "0" })
        .option("toll-mint", { type: "string", describe: "defaults to new mint (localnet convenience)" })
        .option("submitters", { type: "string", describe: "comma-separated pubkeys (default wallet)" })
        .option("miners", { type: "string", describe: "comma-separated pubkeys (default wallet)" })
        .option("diversity-target", { type: "number", default: 100 })
        .option("alpha-correctness", { type: "number", default: 5000 })
        .option("alpha-diversity", { type: "number", default: 2000 })
        .option("alpha-timeliness", { type: "number", default: 2000 })
        .option("alpha-uptime", { type: "number", default: 1000 })
        .option("penalty-bps", { type: "number", default: 2000 })
        .option("dominance-threshold-bps", { type: "number", default: 2500 })
    )
    .command("report", "Report miner epoch stats", (y) =>
      y
        .option("epoch", { type: "number", demandOption: true })
        .option("miner", { type: "string", demandOption: true })
        .option("stake-weight", { type: "string", demandOption: true })
        .option("aggregates", { type: "number", demandOption: true })
        .option("unique-names", { type: "number", demandOption: true })
        .option("unique-receipts", { type: "number", demandOption: true })
        .option("first-slot", { type: "number", demandOption: true })
        .option("last-slot", { type: "number", demandOption: true })
        .option("uptime", { type: "number", default: 10000 })
        .option("correctness", { type: "number", default: 10000 })
        .option("dominance", { type: "number", default: 0 })
    )
    .command("finalize-epoch", "Finalize epoch totals (O(1))", (y) =>
      y
        .option("epoch", { type: "number", demandOption: true })
        .option("total-raw", { type: "string", demandOption: true, describe: "u128 decimal" })
        .option("total-normalized", { type: "string", demandOption: true, describe: "u128 decimal" })
        .option("pool", { type: "string", demandOption: true, describe: "u64 planned rewards (base units)" })
        .option("miner-count", { type: "number", demandOption: true })
        .option("dominance-max", { type: "number", demandOption: true })
    )
    .command("set-reward", "Set a miner reward for an epoch", (y) =>
      y
        .option("epoch", { type: "number", demandOption: true })
        .option("miner", { type: "string", demandOption: true })
        .option("normalized", { type: "string", demandOption: true, describe: "u128 decimal" })
        .option("amount", { type: "string", demandOption: true })
    )
    .command("claim", "Claim reward for wallet miner", (y) =>
      y.option("epoch", { type: "number", demandOption: true })
    )
    .command("penalize", "Apply a penalty (reduces reward if not claimed)", (y) =>
      y
        .option("epoch", { type: "number", demandOption: true })
        .option("miner", { type: "string", demandOption: true })
        .option("penalty-bps", { type: "number", demandOption: true })
        .option("reason", { type: "string", demandOption: true })
    )
    .option("rpc", { type: "string" })
    .option("wallet", { type: "string" })
    .option("program-id", { type: "string" })
    .demandCommand(1)
    .strict()
    .parse();

  if (argv.rpc) process.env.ANCHOR_PROVIDER_URL = argv.rpc;
  if (argv.wallet) process.env.ANCHOR_WALLET = argv.wallet;

  const rpcUrl = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const walletPath =
    process.env.ANCHOR_WALLET || path.join(process.env.HOME || ".", ".config/solana/id.json");

  const payer = loadKeypair(walletPath);
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = loadIdl();
  const programIdStr =
    (argv["program-id"] as string | undefined) ||
    process.env.DDNS_MINER_SCORE_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpcUrl);
  if (!programIdStr) throw new Error("program id not found (set --program-id or DDNS_MINER_SCORE_PROGRAM_ID)");
  const programId = new PublicKey(programIdStr);
  const program = new anchor.Program(idl as any, programId, provider);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("miner_score_config")], programId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([Buffer.from("miner_score_vault_authority")], programId);
  const [rewardVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("reward_vault")], programId);

  const cmd = argv._[0];

  if (cmd === "init-config") {
    let tollMint = argv["toll-mint"] ? new PublicKey(argv["toll-mint"] as string) : null;
    if (!tollMint) {
      tollMint = await createMint(connection, payer, payer.publicKey, null, 9);
      const ata = await getOrCreateAssociatedTokenAccount(connection, payer, tollMint, payer.publicKey);
      await mintTo(connection, payer, tollMint, ata.address, payer, 1_000_000_000_000n);
      console.log("created toll_mint:", tollMint.toBase58());
    }

    const submitters =
      (argv.submitters as string | undefined)?.split(",").filter(Boolean).map((s) => new PublicKey(s)) ||
      [payer.publicKey];
    const miners =
      (argv.miners as string | undefined)?.split(",").filter(Boolean).map((s) => new PublicKey(s)) ||
      [payer.publicKey];

    const sig = await program.methods
      .initMinerScoreConfig(
        new BN(argv["epoch-len-slots"] as number),
        new BN(argv["base-reward"] as string),
        new BN(argv.cap as string),
        new BN(argv["min-stake-weight"] as string),
        submitters,
        miners,
        argv["alpha-correctness"] as number,
        argv["alpha-diversity"] as number,
        argv["alpha-timeliness"] as number,
        argv["alpha-uptime"] as number,
        argv["penalty-bps"] as number,
        argv["dominance-threshold-bps"] as number,
        argv["diversity-target"] as number
      )
      .accounts({
        config: configPda,
        vaultAuthority,
        tollMint,
        rewardVault: rewardVaultPda,
        authority: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log(JSON.stringify({ tx: sig, programId: programId.toBase58(), configPda: configPda.toBase58(), vaultAuthority: vaultAuthority.toBase58(), tollMint: tollMint.toBase58() }, null, 2));
    return;
  }

  if (cmd === "report") {
    const epochId = BigInt(argv.epoch);
    const miner = new PublicKey(argv.miner as string);
    const [minerEpochPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_epoch"), u64le(epochId), miner.toBuffer()],
      programId
    );

    const sig = await program.methods
      .reportMinerEpochStats(
        new BN(argv.epoch),
        miner,
        new BN(argv["stake-weight"] as string),
        argv.aggregates as number,
        argv["unique-names"] as number,
        argv["unique-receipts"] as number,
        new BN(argv["first-slot"] as number),
        new BN(argv["last-slot"] as number),
        argv.uptime as number,
        argv.correctness as number,
        argv.dominance as number
      )
      .accounts({
        config: configPda,
        minerEpoch: minerEpochPda,
        submitter: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(JSON.stringify({ tx: sig, minerEpochPda: minerEpochPda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "finalize-epoch") {
    const epochId = BigInt(argv.epoch);
    const [epochTotalsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("epoch_totals"), u64le(epochId)],
      programId
    );

    const sig = await program.methods
      .finalizeEpoch(
        new BN(argv.epoch),
        new BN(argv["total-raw"] as string),
        new BN(argv["total-normalized"] as string),
        new BN(argv.pool as string),
        argv["miner-count"] as number,
        argv["dominance-max"] as number
      )
      .accounts({
        config: configPda,
        epochTotals: epochTotalsPda,
        submitter: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(JSON.stringify({ tx: sig, epochTotalsPda: epochTotalsPda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "set-reward") {
    const epochId = BigInt(argv.epoch);
    const miner = new PublicKey(argv.miner as string);
    const [epochTotalsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("epoch_totals"), u64le(epochId)],
      programId
    );
    const [minerEpochPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_epoch"), u64le(epochId), miner.toBuffer()],
      programId
    );
    const sig = await program.methods
      .setMinerReward(new BN(argv.epoch), miner, new BN(argv.normalized as string), new BN(argv.amount as string))
      .accounts({
        config: configPda,
        epochTotals: epochTotalsPda,
        minerEpoch: minerEpochPda,
        submitter: payer.publicKey,
      })
      .rpc();
    console.log(JSON.stringify({ tx: sig, minerEpochPda: minerEpochPda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "claim") {
    const epochId = BigInt(argv.epoch);
    const [epochTotalsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("epoch_totals"), u64le(epochId)],
      programId
    );
    const [minerEpochPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_epoch"), u64le(epochId), payer.publicKey.toBuffer()],
      programId
    );
    const [claimPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("claim"), u64le(epochId), payer.publicKey.toBuffer()],
      programId
    );
    const cfg: any = await program.account.minerScoreConfig.fetch(configPda);
    const tollMint = new PublicKey(cfg.tollMint);
    const minerAta = getAssociatedTokenAddressSync(tollMint, payer.publicKey);

    const sig = await program.methods
      .claimMinerReward(new BN(argv.epoch))
      .accounts({
        config: configPda,
        vaultAuthority,
        rewardVault: new PublicKey(cfg.rewardVault),
        minerEpoch: minerEpochPda,
        miner: payer.publicKey,
        minerAta,
        claimReceipt: claimPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(JSON.stringify({ tx: sig, minerAta: minerAta.toBase58(), claimPda: claimPda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "penalize") {
    const epochId = BigInt(argv.epoch);
    const miner = new PublicKey(argv.miner as string);
    const reasonHash = sha256(Buffer.from(argv.reason as string, "utf8"));
    const [minerEpochPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("miner_epoch"), u64le(epochId), miner.toBuffer()],
      programId
    );
    const sig = await program.methods
      .penalizeMiner(new BN(argv.epoch), miner, argv["penalty-bps"] as number, Array.from(reasonHash) as any)
      .accounts({
        config: configPda,
        minerEpoch: minerEpochPda,
        submitter: payer.publicKey,
      })
      .rpc();
    console.log(JSON.stringify({ tx: sig, minerEpochPda: minerEpochPda.toBase58(), reasonHash: Buffer.from(reasonHash).toString("hex") }, null, 2));
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

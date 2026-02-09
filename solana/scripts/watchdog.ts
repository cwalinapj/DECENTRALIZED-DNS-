import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function normalizeName(name: string): string {
  let n = name.trim().toLowerCase();
  if (n.endsWith(".")) n = n.slice(0, -1);
  return n;
}

function nameHash(name: string): Buffer {
  const n = normalizeName(name);
  return sha256(Buffer.from(n, "utf8"));
}

function loadIdl() {
  const idlPath = path.resolve("target/idl/ddns_watchdog_policy.json");
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
      `\\[${section}\\][^\\[]*?ddns_watchdog_policy\\s*=\\s*\"([^\"]+)\"`,
      "s"
    );
    const match = content.match(re);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command("init-config", "Initialize watchdog policy config", (y) =>
      y
        .option("epoch-len-slots", { type: "number", default: 10 })
        .option("max-age-secs", { type: "number", default: 3600 })
        .option("min-watchdogs", { type: "number", default: 2 })
        .option("warn-bps", { type: "number", default: 2000 })
        .option("quarantine-bps", { type: "number", default: 5000 })
        .option("watchdogs", { type: "string", demandOption: true, describe: "comma-separated watchdog pubkeys" })
        .option("submitters", { type: "string", describe: "comma-separated submitter pubkeys (default wallet)" })
    )
    .command("enable-watchdog", "Enable/disable a watchdog (admin)", (y) =>
      y.option("watchdog", { type: "string", demandOption: true }).option("enabled", { type: "boolean", demandOption: true })
    )
    .command("submit-digest", "Submit an attestation digest (MVP)", (y) =>
      y
        .option("name", { type: "string", demandOption: true })
        .option("kind", { type: "string", demandOption: true, choices: ["resolve", "censorship", "integrity"] as const })
        .option("outcome", { type: "number", default: 0 })
        .option("flags", { type: "number", default: 0 })
        .option("confidence", { type: "number", default: 10000 })
        .option("rrset-hash", { type: "string", default: "00".repeat(32), describe: "hex32" })
        .option("watchdog", { type: "string", demandOption: true, describe: "watchdog pubkey (identity being attributed)" })
        .option("root", { type: "string", default: "00".repeat(32), describe: "hex32 (merkle root placeholder)" })
        .option("observed-at", { type: "number", describe: "unix seconds (default now)" })
    )
    .command("get-policy", "Fetch NamePolicyState for a name", (y) =>
      y.option("name", { type: "string", demandOption: true })
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
    process.env.DDNS_WATCHDOG_POLICY_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpcUrl);
  if (!programIdStr) throw new Error("program id not found (set --program-id or DDNS_WATCHDOG_POLICY_PROGRAM_ID)");
  const programId = new PublicKey(programIdStr);
  const program = new anchor.Program(idl as any, programId, provider);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("policy_config")], programId);

  const cmd = argv._[0];

  if (cmd === "init-config") {
    const watchdogs = (argv.watchdogs as string).split(",").filter(Boolean).map((s) => new PublicKey(s.trim()));
    const submitters =
      (argv.submitters as string | undefined)?.split(",").filter(Boolean).map((s) => new PublicKey(s.trim())) ||
      [payer.publicKey];

    const sig = await program.methods
      .initPolicyConfig({
        epochLenSlots: new BN(argv["epoch-len-slots"] as number),
        attestationMaxAgeSecs: argv["max-age-secs"] as number,
        minWatchdogs: argv["min-watchdogs"] as number,
        warnThresholdBps: argv["warn-bps"] as number,
        quarantineThresholdBps: argv["quarantine-bps"] as number,
        allowlistedWatchdogs: watchdogs,
        allowlistedSubmitters: submitters,
      })
      .accounts({
        config: configPda,
        authority: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(JSON.stringify({ tx: sig, configPda: configPda.toBase58(), programId: programId.toBase58() }, null, 2));
    return;
  }

  if (cmd === "enable-watchdog") {
    const watchdog = new PublicKey(argv.watchdog as string);
    const [watchdogStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("watchdog"), watchdog.toBuffer()],
      programId
    );
    const sig = await program.methods
      .setWatchdogEnabled(watchdog, argv.enabled as boolean)
      .accounts({
        config: configPda,
        watchdog,
        watchdogState: watchdogStatePda,
        authority: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(JSON.stringify({ tx: sig, watchdogStatePda: watchdogStatePda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "submit-digest") {
    const kindStr = argv.kind as string;
    const kind = kindStr === "resolve" ? 1 : kindStr === "censorship" ? 2 : 3;
    const nh = nameHash(argv.name as string);
    const watchdog = new PublicKey(argv.watchdog as string);
    const [watchdogStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("watchdog"), watchdog.toBuffer()],
      programId
    );
    const [namePolicyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("name_policy"), nh],
      programId
    );

    const cfg: any = await program.account.policyConfig.fetch(configPda);
    const epochLenSlots = BigInt(cfg.epochLenSlots.toString());
    const slot = BigInt(await connection.getSlot("confirmed"));
    const epochId = slot / epochLenSlots;

    const [attestLogPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("attest_log"), u64le(epochId), nh],
      programId
    );
    const [attestMarkPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("attest_mark"), u64le(epochId), nh, watchdog.toBuffer()],
      programId
    );

    const rrsetHashHex = (argv["rrset-hash"] as string).replace(/^0x/, "");
    const rrsetHash = Buffer.from(rrsetHashHex, "hex");
    const rootHex = (argv.root as string).replace(/^0x/, "");
    const root = Buffer.from(rootHex, "hex");
    const observedAt = (argv["observed-at"] as number | undefined) ?? Math.floor(Date.now() / 1000);

    const sig = await program.methods
      .submitAttestationDigest(
        new BN(epochId.toString()),
        Array.from(nh) as any,
        kind,
        argv.outcome as number,
        argv.flags as number,
        argv.confidence as number,
        Array.from(rrsetHash) as any,
        new BN(observedAt),
        Array.from(root) as any
      )
      .accounts({
        config: configPda,
        watchdog,
        watchdogState: watchdogStatePda,
        namePolicyState: namePolicyPda,
        attestLog: attestLogPda,
        attestMark: attestMarkPda,
        submitter: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(
      JSON.stringify(
        {
          tx: sig,
          epochId: epochId.toString(),
          nameHash: nh.toString("hex"),
          namePolicyPda: namePolicyPda.toBase58(),
          attestLogPda: attestLogPda.toBase58(),
          attestMarkPda: attestMarkPda.toBase58(),
        },
        null,
        2
      )
    );
    return;
  }

  if (cmd === "get-policy") {
    const nh = nameHash(argv.name as string);
    const [namePolicyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("name_policy"), nh],
      programId
    );
    const st = await program.account.namePolicyState.fetchNullable(namePolicyPda);
    console.log(JSON.stringify({ nameHash: nh.toString("hex"), namePolicyPda: namePolicyPda.toBase58(), state: st || null }, null, 2));
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

function loadKeypair(filePath: string): anchor.web3.Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdlOrThrow(programFileBase: string) {
  const idlPath = path.resolve(`target/idl/${programFileBase}.json`);
  if (!fs.existsSync(idlPath)) {
    throw new Error(`IDL not found at ${idlPath}. Run 'anchor build' in /solana first.`);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  if (!idl.name && idl.metadata?.name) idl.name = idl.metadata.name;
  if (!idl.version && idl.metadata?.version) idl.version = idl.metadata.version;

  // Provide sizes so Anchor JS can build init instructions.
  const sizeMap: Record<string, number> = {
    OperatorsConfig: 8 + 3627,
    Operator: 8 + 334,
    EpochMetrics: 8 + 151,
    DomainNsDelegation: 8 + 114,
  };
  if (Array.isArray(idl.accounts)) {
    for (const acct of idl.accounts) {
      if (acct && typeof acct === "object" && !acct.size && sizeMap[acct.name]) {
        acct.size = sizeMap[acct.name];
      }
    }
  }
  return idl;
}

function readProgramIdFromAnchorToml(rpcUrl: string, programName: string): string | null {
  try {
    const tomlPath = path.resolve("Anchor.toml");
    if (!fs.existsSync(tomlPath)) return null;
    const content = fs.readFileSync(tomlPath, "utf8");
    const isLocal = /127\\.0\\.0\\.1|localhost/.test(rpcUrl);
    const section = isLocal ? "programs.localnet" : "programs.devnet";
    const re = new RegExp(`\\[${section}\\][^\\[]*?${programName}\\s*=\\s*\"([^\"]+)\"`, "s");
    const match = content.match(re);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function u64LE(n: bigint) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function nameHashDns(name: string): Buffer {
  const n = name.trim().toLowerCase();
  return sha256(Buffer.from(n, "utf8"));
}

type EndpointInput = { endpoint_kind: number; value_hex: string; region?: number };

function parseEndpoint(s: string): EndpointInput {
  // format: kind:valueHex[:region]
  // kind: doh|ipv4|ipv6|dnsname
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) throw new Error(`bad endpoint: ${s}`);
  const kindStr = parts[0];
  const valueHex = parts[1].replace(/^0x/, "");
  const region = parts.length === 3 ? Number(parts[2]) : 0;
  let kind = 0;
  if (kindStr === "doh") kind = 0;
  else if (kindStr === "ipv4") kind = 1;
  else if (kindStr === "ipv6") kind = 2;
  else if (kindStr === "dnsname") kind = 3;
  else throw new Error(`unknown endpoint kind: ${kindStr}`);
  if (!/^[0-9a-fA-F]{64}$/.test(valueHex)) throw new Error("value_hex must be 32 bytes hex (64 chars)");
  return { endpoint_kind: kind, value_hex: valueHex.toLowerCase(), region };
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command("config", "Print config PDA + state", (y) => y)
    .command("init", "Init OperatorsConfig + treasury vault (once)", (y) =>
      y
        .option("toll-mint", { type: "string", demandOption: true })
        .option("epoch-len-slots", { type: "string", default: "100" })
        .option("min-operator-stake-lamports", { type: "string", default: "1000000" })
        .option("max-endpoints", { type: "number", default: 4 })
        .option("reward-per-paid-query", { type: "string", default: "0" })
        .option("reward-per-verified-receipt", { type: "string", default: "0" })
        .option("uptime-bonus-per-10k", { type: "string", default: "0" })
        .option("latency-bonus-threshold-ms", { type: "number", default: 0 })
        .option("latency-bonus", { type: "string", default: "0" })
        .option("max-rewards-per-epoch", { type: "string", default: "0" })
        .option("submitter", { type: "array", describe: "Allowlisted metrics submitter pubkey (repeatable)" })
        .option("slasher", { type: "array", describe: "Allowlisted slashing authority pubkey (repeatable)" })
        .option("enabled", { type: "boolean", default: true })
    )
    .command("register", "Register operator record + stake vault PDA", (y) =>
      y
        .option("kind", { type: "number", default: 2, describe: "0=DoH,1=NS,2=Both" })
        .option("endpoint", { type: "array", describe: "Endpoint: doh|ipv4|ipv6|dnsname:<32bytehex>[:region]" })
        .option("payout-ata", { type: "string", demandOption: true })
    )
    .command("stake", "Stake SOL into operator_vault", (y) =>
      y.option("amount-lamports", { type: "string", demandOption: true })
    )
    .command("unstake", "Unstake SOL from operator_vault (pauses if below min)", (y) =>
      y.option("amount-lamports", { type: "string", demandOption: true })
    )
    .command("pause", "Pause operator", (y) => y)
    .command("resume", "Resume operator (requires stake >= min)", (y) => y)
    .command("domain-set", "Set DomainNSDelegation for a .dns name_hash", (y) =>
      y
        .option("name", { type: "string", demandOption: true, describe: "example.dns" })
        .option("operator-wallet", { type: "string", demandOption: true })
        .option("enabled", { type: "boolean", default: true })
    )
    .command("metrics-submit", "Submit epoch metrics (allowlisted)", (y) =>
      y
        .option("operator-wallet", { type: "string", demandOption: true })
        .option("epoch-id", { type: "string", demandOption: true })
        .option("paid-query-count", { type: "string", demandOption: true })
        .option("receipt-count", { type: "string", demandOption: true })
        .option("uptime-score", { type: "number", default: 10000 })
        .option("latency-ms-p50", { type: "number", default: 0 })
        .option("metrics-root", { type: "string", describe: "32-byte hex; default random" })
    )
    .command("claim", "Claim operator rewards for an epoch", (y) =>
      y
        .option("epoch-id", { type: "string", demandOption: true })
        .option("treasury-vault", { type: "string", describe: "Override treasury vault pubkey (optional)" })
        .option("payout-ata", { type: "string", demandOption: true })
    )
    .command("slash", "Slash operator (authority/allowlisted)", (y) =>
      y
        .option("operator-wallet", { type: "string", demandOption: true })
        .option("slash-bps", { type: "number", demandOption: true })
        .option("reason-code", { type: "number", default: 1 })
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

  const idl = loadIdlOrThrow("ddns_operators");
  const programIdStr =
    argv["program-id"] ||
    process.env.DDNS_OPERATORS_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpcUrl, "ddns_operators");
  if (!programIdStr) throw new Error("ddns_operators program id not found; set DDNS_OPERATORS_PROGRAM_ID");
  const programId = new PublicKey(programIdStr);
  const idlWithAddress = { ...(idl as any), address: programId.toBase58() };
  const program = new anchor.Program(idlWithAddress as any, provider);

  const [operatorsConfig] = PublicKey.findProgramAddressSync([Buffer.from("operators_config")], programId);
  const [treasuryAuthority] = PublicKey.findProgramAddressSync([Buffer.from("treasury_authority")], programId);
  console.log("rpc:", rpcUrl);
  console.log("ddns_operators_program_id:", programId.toBase58());
  console.log("wallet_pubkey:", payer.publicKey.toBase58());
  console.log("pda_operators_config:", operatorsConfig.toBase58());
  console.log("pda_treasury_authority:", treasuryAuthority.toBase58());

  const cmd = String(argv._[0]);
  if (cmd === "config") {
    const cfg: any = await program.account.operatorsConfig.fetchNullable(operatorsConfig);
    console.log(
      "operators_config:",
      cfg
        ? {
            authority: cfg.authority.toBase58(),
            toll_mint: cfg.tollMint.toBase58(),
            treasury_vault: cfg.treasuryVault.toBase58(),
            epoch_len_slots: cfg.epochLenSlots.toString(),
            min_operator_stake_lamports: cfg.minOperatorStakeLamports.toString(),
            max_endpoints: cfg.maxEndpointsPerOperator,
            reward_per_paid_query: cfg.rewardPerPaidQuery.toString(),
            reward_per_verified_receipt: cfg.rewardPerVerifiedReceipt.toString(),
            uptime_bonus_per_10k: cfg.uptimeBonusPer10k.toString(),
            latency_bonus_threshold_ms: cfg.latencyBonusThresholdMs,
            latency_bonus: cfg.latencyBonus.toString(),
            max_rewards_per_epoch: cfg.maxRewardsPerEpoch.toString(),
            enabled: cfg.enabled,
            metrics_submitters: (cfg.metricsSubmitters || []).map((p: PublicKey) => p.toBase58()),
          }
        : null
    );
    return;
  }

  if (cmd === "init") {
    const existing = await program.account.operatorsConfig.fetchNullable(operatorsConfig);
    if (existing) {
      console.log("operators_config_exists: true");
      return;
    }

    const tollMint = new PublicKey(String((argv as any)["toll-mint"]));
    const treasuryVault = Keypair.generate();

    const submitters = ((argv as any).submitter?.length ? ((argv as any).submitter as any[]) : [payer.publicKey.toBase58()]).map(
      (s) => new PublicKey(String(s))
    );
    const slashers = (((argv as any).slasher as any[]) || []).map((s) => new PublicKey(String(s)));

    const sig = await program.methods
      .initOperatorsConfig(
        new BN(String((argv as any)["epoch-len-slots"])),
        new BN(String((argv as any)["min-operator-stake-lamports"])),
        Number((argv as any)["max-endpoints"]),
        new BN(String((argv as any)["reward-per-paid-query"])),
        new BN(String((argv as any)["reward-per-verified-receipt"])),
        new BN(String((argv as any)["uptime-bonus-per-10k"])),
        Number((argv as any)["latency-bonus-threshold-ms"]),
        new BN(String((argv as any)["latency-bonus"])),
        new BN(String((argv as any)["max-rewards-per-epoch"])),
        submitters,
        slashers,
        Boolean((argv as any).enabled)
      )
      .accounts({
        authority: payer.publicKey,
        operatorsConfig,
        tollMint,
        treasuryAuthority,
        treasuryVault: treasuryVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([treasuryVault])
      .rpc();

    console.log("treasury_vault:", treasuryVault.publicKey.toBase58());
    console.log("tx_init_operators_config:", sig);
    return;
  }

  const cfg: any = await program.account.operatorsConfig.fetchNullable(operatorsConfig);
  if (!cfg) throw new Error("operators_config missing; run: npm -C solana run operators -- init ...");

  const [operator] = PublicKey.findProgramAddressSync([Buffer.from("operator"), payer.publicKey.toBuffer()], programId);
  const [operatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("operator_vault"), payer.publicKey.toBuffer()],
    programId
  );

  if (cmd === "register") {
    const kind = Number((argv as any).kind);
    const eps = (((argv as any).endpoint as string[]) || []).map((s) => parseEndpoint(String(s)));
    const endpoints = eps.map((e) => ({
      endpointKind: e.endpoint_kind,
      value: Array.from(Buffer.from(e.value_hex, "hex")),
      region: e.region ?? 0,
    }));
    const payout = new PublicKey(String((argv as any)["payout-ata"]));

    const sig = await program.methods
      .registerOperator(kind, endpoints, payout)
      .accounts({
        operatorWallet: payer.publicKey,
        operatorsConfig,
        operator,
        operatorVault,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("pda_operator:", operator.toBase58());
    console.log("pda_operator_vault:", operatorVault.toBase58());
    console.log("payout_ata:", payout.toBase58());
    console.log("tx_register_operator:", sig);
    return;
  }

  if (cmd === "stake") {
    const amount = new BN(String((argv as any)["amount-lamports"]));
    const sig = await program.methods
      .stakeOperator(amount)
      .accounts({
        operatorWallet: payer.publicKey,
        operatorsConfig,
        operator,
        operatorVault,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("amount_lamports:", amount.toString());
    console.log("tx_stake_operator:", sig);
    return;
  }

  if (cmd === "unstake") {
    const amount = new BN(String((argv as any)["amount-lamports"]));
    const sig = await program.methods
      .unstakeOperator(amount)
      .accounts({
        operatorWallet: payer.publicKey,
        operatorsConfig,
        operator,
        operatorVault,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("amount_lamports:", amount.toString());
    console.log("tx_unstake_operator:", sig);
    return;
  }

  if (cmd === "pause") {
    const sig = await program.methods
      .pauseOperator()
      .accounts({ operatorWallet: payer.publicKey, operatorsConfig, operator })
      .rpc();
    console.log("tx_pause_operator:", sig);
    return;
  }

  if (cmd === "resume") {
    const sig = await program.methods
      .resumeOperator()
      .accounts({ operatorWallet: payer.publicKey, operatorsConfig, operator })
      .rpc();
    console.log("tx_resume_operator:", sig);
    return;
  }

  if (cmd === "domain-set") {
    const name = String((argv as any).name);
    const nh = nameHashDns(name);
    const operatorWallet = new PublicKey(String((argv as any)["operator-wallet"]));
    const enabled = Boolean((argv as any).enabled);

    const [domainNs] = PublicKey.findProgramAddressSync([Buffer.from("domain_ns"), nh], programId);
    const sig = await program.methods
      .setDomainNsOperator(Array.from(nh), operatorWallet, enabled)
      .accounts({
        owner: payer.publicKey,
        operatorsConfig,
        domainNsDelegation: domainNs,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("name:", name);
    console.log("name_hash_hex:", nh.toString("hex"));
    console.log("pda_domain_ns_delegation:", domainNs.toBase58());
    console.log("tx_set_domain_ns_operator:", sig);
    return;
  }

  if (cmd === "metrics-submit") {
    const operatorWallet = new PublicKey(String((argv as any)["operator-wallet"]));
    const epochId = BigInt(String((argv as any)["epoch-id"]));
    const paidQueryCount = new BN(String((argv as any)["paid-query-count"]));
    const receiptCount = new BN(String((argv as any)["receipt-count"]));
    const uptimeScore = Number((argv as any)["uptime-score"]);
    const latency = Number((argv as any)["latency-ms-p50"]);
    const root =
      (argv as any)["metrics-root"] && /^[0-9a-fA-F]{64}$/.test(String((argv as any)["metrics-root"]))
        ? Buffer.from(String((argv as any)["metrics-root"]), "hex")
        : sha256(crypto.randomBytes(32));

    const [epochMetrics] = PublicKey.findProgramAddressSync(
      [Buffer.from("metrics"), u64LE(epochId), operatorWallet.toBuffer()],
      programId
    );
    const [opPda] = PublicKey.findProgramAddressSync([Buffer.from("operator"), operatorWallet.toBuffer()], programId);

    const sig = await program.methods
      .submitEpochMetrics(
        new BN(epochId.toString()),
        paidQueryCount,
        receiptCount,
        uptimeScore,
        latency,
        Array.from(root)
      )
      .accounts({
        operatorsConfig,
        submitter: payer.publicKey,
        operator: opPda,
        epochMetrics,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("epoch_id:", epochId.toString());
    console.log("pda_epoch_metrics:", epochMetrics.toBase58());
    console.log("metrics_root_hex:", root.toString("hex"));
    console.log("tx_submit_epoch_metrics:", sig);
    return;
  }

  if (cmd === "claim") {
    const epochId = BigInt(String((argv as any)["epoch-id"]));
    const [epochMetrics] = PublicKey.findProgramAddressSync(
      [Buffer.from("metrics"), u64LE(epochId), payer.publicKey.toBuffer()],
      programId
    );

    const payoutAta = new PublicKey(String((argv as any)["payout-ata"]));
    const treasuryVaultOverride = (argv as any)["treasury-vault"] ? new PublicKey(String((argv as any)["treasury-vault"])) : null;
    const treasuryVault = treasuryVaultOverride ?? new PublicKey(cfg.treasuryVault);

    const sig = await program.methods
      .claimOperatorRewards(new BN(epochId.toString()))
      .accounts({
        operatorsConfig,
        operatorWallet: payer.publicKey,
        operator,
        epochMetrics,
        treasuryAuthority,
        treasuryVault,
        operatorPayoutAta: payoutAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("epoch_id:", epochId.toString());
    console.log("pda_epoch_metrics:", epochMetrics.toBase58());
    console.log("operator_payout_ata:", payoutAta.toBase58());
    console.log("tx_claim_operator_rewards:", sig);
    return;
  }

  if (cmd === "slash") {
    const operatorWallet = new PublicKey(String((argv as any)["operator-wallet"]));
    const slashBps = Number((argv as any)["slash-bps"]);
    const reasonCode = Number((argv as any)["reason-code"]);

    const [opPda] = PublicKey.findProgramAddressSync([Buffer.from("operator"), operatorWallet.toBuffer()], programId);
    const [opVault] = PublicKey.findProgramAddressSync([Buffer.from("operator_vault"), operatorWallet.toBuffer()], programId);

    const sig = await program.methods
      .slashOperator(slashBps, reasonCode)
      .accounts({
        signer: payer.publicKey,
        operatorsConfig,
        authorityDestination: cfg.authority,
        operator: opPda,
        operatorVault: opVault,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("operator_wallet:", operatorWallet.toBase58());
    console.log("tx_slash_operator:", sig);
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

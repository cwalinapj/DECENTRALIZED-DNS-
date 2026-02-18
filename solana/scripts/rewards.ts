import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

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

  // Provide sizes so Anchor JS can build account alloc instructions when needed.
  const sizeMap: Record<string, number> = {
    RewardsConfig: 8 + 2191,
    DomainClaim: 8 + 360,
    DomainChallenge: 8 + 89,
    DomainUsageEpoch: 8 + 149,
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

function normalizeFqdn(fqdn: string): string {
  const s0 = fqdn.trim().toLowerCase();
  return s0.endsWith(".") ? s0.slice(0, -1) : s0;
}

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function domainHash(fqdn: string): Buffer {
  return sha256(Buffer.from(normalizeFqdn(fqdn), "utf8"));
}

function parseHex16(hex: string): Buffer {
  const h = hex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(h) || h.length !== 32) {
    throw new Error("nonce must be 16 bytes hex (32 hex chars)");
  }
  return Buffer.from(h, "hex");
}

function parseHex32(hex: string): Buffer {
  const h = hex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(h) || h.length !== 64) {
    throw new Error("expected 32 bytes hex (64 hex chars)");
  }
  return Buffer.from(h, "hex");
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command("status", "Print key PDAs + config state", (y) => y)
    .command("init", "Initialize RewardsConfig + treasury vault (once)", (y) =>
      y
        .option("toll-mint", { type: "string", demandOption: true, describe: "TOLL SPL mint pubkey" })
        .option("domain-share-bps", { type: "number", default: 1500 })
        .option("epoch-reward-bps", { type: "number", default: 0 })
        .option("min-toll-amount", { type: "string", default: "1" })
        .option("epoch-len-slots", { type: "string", default: "100" })
        .option("max-reward-per-epoch-per-domain", { type: "string", default: "0" })
        .option("min-unique-wallets", { type: "number", default: 0 })
        .option("challenge-ttl-slots", { type: "string", default: "1000" })
        .option("enabled", { type: "boolean", default: false })
        .option("verifier", {
          type: "array",
          describe: "Allowlisted verifier/miner pubkey (repeatable). If omitted, defaults to wallet pubkey.",
        })
    )
    .command("challenge", "Start an on-chain domain challenge (domain owner wallet)", (y) =>
      y.option("fqdn", { type: "string", demandOption: true })
    )
    .command("claim", "Claim/verify a domain (authority wallet; MVP centralized)", (y) =>
      y
        .option("fqdn", { type: "string", demandOption: true })
        .option("nonce", { type: "string", demandOption: true, describe: "nonce hex from `challenge` output" })
        .option("owner-wallet", { type: "string", demandOption: true })
        .option("payout-ata", { type: "string", demandOption: true })
    )
    .command("pay", "Pay a per-query toll; optionally share with a verified domain owner", (y) =>
      y
        .option("amount", { type: "string", demandOption: true, describe: "TOLL amount in base units (u64)" })
        .option("fqdn", { type: "string", describe: "If provided and verified, pays revenue share to domain owner" })
    )
    .command("usage-submit", "Submit a miner usage aggregate for a domain + epoch (allowlisted)", (y) =>
      y
        .option("fqdn", { type: "string", demandOption: true })
        .option("epoch-id", { type: "string", describe: "Override epoch_id (u64). Default: current epoch." })
        .option("query-count", { type: "string", demandOption: true })
        .option("paid-toll-amount", { type: "string", demandOption: true })
        .option("unique-wallet-count", { type: "number", default: 0 })
        .option("aggregate-root", { type: "string", describe: "32-byte hex; default: sha256(random)" })
    )
    .command("reward-claim", "Claim an epoch bonus reward (domain owner wallet)", (y) =>
      y
        .option("fqdn", { type: "string", demandOption: true })
        .option("epoch-id", { type: "string", demandOption: true })
    )
    .option("rpc", { type: "string", describe: "RPC URL override" })
    .option("wallet", { type: "string", describe: "Wallet keypair path override" })
    .option("program-id", { type: "string", describe: "ddns_rewards program id override" })
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

  const idl = loadIdlOrThrow("ddns_rewards");
  const programIdStr =
    argv["program-id"] ||
    process.env.DDNS_REWARDS_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpcUrl, "ddns_rewards");
  if (!programIdStr) throw new Error("ddns_rewards program id not found; set DDNS_REWARDS_PROGRAM_ID");
  const programId = new PublicKey(programIdStr);
  const idlWithAddress = { ...(idl as any), address: programId.toBase58() };
  const program = new anchor.Program(idlWithAddress as any, provider);

  const [rewardsConfig] = PublicKey.findProgramAddressSync([Buffer.from("rewards_config")], programId);
  const [treasuryAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_authority")],
    programId
  );

  console.log("rpc:", rpcUrl);
  console.log("ddns_rewards_program_id:", programId.toBase58());
  console.log("wallet_pubkey:", payer.publicKey.toBase58());
  console.log("pda_rewards_config:", rewardsConfig.toBase58());
  console.log("pda_treasury_authority:", treasuryAuthority.toBase58());

  const cmd = String(argv._[0]);

  if (cmd === "status") {
    const cfg: any = await program.account.rewardsConfig.fetchNullable(rewardsConfig);
    console.log(
      "rewards_config:",
      cfg
        ? {
            authority: cfg.authority.toBase58(),
            toll_mint: cfg.tollMint.toBase58(),
            treasury_vault: cfg.treasuryVault.toBase58(),
            domain_share_bps: cfg.domainShareBps,
            epoch_reward_bps: cfg.epochRewardBps,
            min_toll_amount: cfg.minTollAmount.toString(),
            epoch_len_slots: cfg.epochLenSlots.toString(),
            max_reward_per_epoch_per_domain: cfg.maxRewardPerEpochPerDomain.toString(),
            min_unique_wallets: cfg.minUniqueWallets,
            challenge_ttl_slots: cfg.challengeTtlSlots.toString(),
            enabled: cfg.enabled,
            verifiers: (cfg.verifiers || []).map((v: PublicKey) => v.toBase58()),
          }
        : null
    );
    return;
  }

  if (cmd === "init") {
    const existing = await program.account.rewardsConfig.fetchNullable(rewardsConfig);
    if (existing) {
      console.log("rewards_config_exists: true");
      return;
    }

    const tollMint = new PublicKey(String(argv["toll-mint"]));
    const treasuryVault = Keypair.generate();

    const verifiers = (argv.verifier?.length ? (argv.verifier as any[]) : [payer.publicKey.toBase58()]).map(
      (s) => new PublicKey(String(s))
    );

    const sig = await program.methods
      .initRewardsConfig(
        Number(argv["domain-share-bps"]),
        Number(argv["epoch-reward-bps"]),
        new BN(String(argv["min-toll-amount"])),
        new BN(String(argv["epoch-len-slots"])),
        new BN(String(argv["max-reward-per-epoch-per-domain"])),
        Number(argv["min-unique-wallets"]),
        new BN(String(argv["challenge-ttl-slots"])),
        Boolean(argv.enabled),
        verifiers
      )
      .accounts({
        authority: payer.publicKey,
        rewardsConfig,
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
    console.log("tx_init_rewards_config:", sig);
    return;
  }

  const cfg: any = await program.account.rewardsConfig.fetchNullable(rewardsConfig);
  if (!cfg) throw new Error("rewards_config missing; run: npm -C solana run rewards -- init ...");
  const tollMint = new PublicKey(cfg.tollMint);
  const treasuryVault = new PublicKey(cfg.treasuryVault);

  if (cmd === "challenge") {
    const fqdn = String((argv as any).fqdn);
    const dh = domainHash(fqdn);
    const nonce = crypto.randomBytes(16);
    const [domainChallenge] = PublicKey.findProgramAddressSync(
      [Buffer.from("challenge"), dh, nonce],
      programId
    );

    const sig = await program.methods
      .startDomainChallenge(fqdn, Array.from(dh), Array.from(nonce))
      .accounts({
        rewardsConfig,
        owner: payer.publicKey,
        domainChallenge,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("fqdn_normalized:", normalizeFqdn(fqdn));
    console.log("domain_hash_hex:", dh.toString("hex"));
    console.log("nonce_hex:", nonce.toString("hex"));
    console.log("pda_domain_challenge:", domainChallenge.toBase58());
    console.log(`dns_txt_record: _ddns-challenge.${normalizeFqdn(fqdn)}`);
    console.log(`dns_txt_value: ${nonce.toString("hex")}`);
    console.log("tx_start_domain_challenge:", sig);
    return;
  }

  if (cmd === "claim") {
    const fqdn = String((argv as any).fqdn);
    const dh = domainHash(fqdn);
    const nonce = parseHex16(String((argv as any).nonce));
    const ownerWallet = new PublicKey(String((argv as any)["owner-wallet"]));
    const payoutAta = new PublicKey(String((argv as any)["payout-ata"]));
    const [domainChallenge] = PublicKey.findProgramAddressSync(
      [Buffer.from("challenge"), dh, nonce],
      programId
    );
    const [domainClaim] = PublicKey.findProgramAddressSync([Buffer.from("domain"), dh], programId);

    const sig = await program.methods
      .claimDomain(fqdn, Array.from(dh), Array.from(nonce), payoutAta)
      .accounts({
        authority: payer.publicKey,
        rewardsConfig,
        domainChallenge,
        domainClaim,
        ownerWallet,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("fqdn_normalized:", normalizeFqdn(fqdn));
    console.log("domain_hash_hex:", dh.toString("hex"));
    console.log("pda_domain_claim:", domainClaim.toBase58());
    console.log("payout_ata:", payoutAta.toBase58());
    console.log("tx_claim_domain:", sig);
    return;
  }

  if (cmd === "pay") {
    const amount = new BN(String((argv as any).amount));
    const maybeFqdn = (argv as any).fqdn ? String((argv as any).fqdn) : null;
    const payerAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      tollMint,
      payer.publicKey,
      true,
      "confirmed",
      undefined,
      TOKEN_PROGRAM_ID
    );

    if (!maybeFqdn) {
      const sig = await program.methods
        .payToll(amount)
        .accounts({
          rewardsConfig,
          payer: payer.publicKey,
          payerTollAta: payerAta.address,
          treasuryVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log("toll_amount:", amount.toString());
      console.log("tx_pay_toll:", sig);
      return;
    }

    const dh = domainHash(maybeFqdn);
    const [domainClaim] = PublicKey.findProgramAddressSync([Buffer.from("domain"), dh], programId);

    // We don't need to load the claim on the client; program enforces verified status + payout.
    // Domain owner payout ATA is loaded from chain and checked in-program, but still must be passed in.
    const claim: any = await program.account.domainClaim.fetch(domainClaim);
    const domainOwnerPayoutAta = new PublicKey(claim.payoutTokenAccount);

    const sig = await program.methods
      .payTollWithDomain(Array.from(dh), amount)
      .accounts({
        rewardsConfig,
        payer: payer.publicKey,
        payerTollAta: payerAta.address,
        domainClaim,
        domainOwnerPayoutAta,
        treasuryVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("fqdn_normalized:", normalizeFqdn(maybeFqdn));
    console.log("domain_hash_hex:", dh.toString("hex"));
    console.log("domain_owner_payout_ata:", domainOwnerPayoutAta.toBase58());
    console.log("toll_amount:", amount.toString());
    console.log("tx_pay_toll_with_domain:", sig);
    return;
  }

  if (cmd === "usage-submit") {
    const fqdn = String((argv as any).fqdn);
    const dh = domainHash(fqdn);
    const epochIdOverride = (argv as any)["epoch-id"] ? BigInt(String((argv as any)["epoch-id"])) : null;

    const slot = await connection.getSlot("confirmed");
    const gotEpoch = BigInt(Math.floor(slot / Number(cfg.epochLenSlots.toString())));
    const epochId = epochIdOverride ?? gotEpoch;

    const [domainClaim] = PublicKey.findProgramAddressSync([Buffer.from("domain"), dh], programId);
    const [domainUsageEpoch] = PublicKey.findProgramAddressSync(
      [Buffer.from("usage"), dh, u64LE(epochId)],
      programId
    );

    const root = (argv as any)["aggregate-root"]
      ? parseHex32(String((argv as any)["aggregate-root"]))
      : sha256(crypto.randomBytes(32));

    const sig = await program.methods
      .submitDomainUsage(
        new BN(epochId.toString()),
        Array.from(dh),
        new BN(String((argv as any)["query-count"])),
        new BN(String((argv as any)["paid-toll-amount"])),
        Number((argv as any)["unique-wallet-count"]),
        Array.from(root)
      )
      .accounts({
        rewardsConfig,
        submitter: payer.publicKey,
        domainClaim,
        domainUsageEpoch,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("fqdn_normalized:", normalizeFqdn(fqdn));
    console.log("domain_hash_hex:", dh.toString("hex"));
    console.log("epoch_id:", epochId.toString());
    console.log("pda_domain_usage_epoch:", domainUsageEpoch.toBase58());
    console.log("aggregate_root_hex:", Buffer.from(root).toString("hex"));
    console.log("tx_submit_domain_usage:", sig);
    return;
  }

  if (cmd === "reward-claim") {
    const fqdn = String((argv as any).fqdn);
    const dh = domainHash(fqdn);
    const epochId = BigInt(String((argv as any)["epoch-id"]));

    const [domainClaim] = PublicKey.findProgramAddressSync([Buffer.from("domain"), dh], programId);
    const [domainUsageEpoch] = PublicKey.findProgramAddressSync(
      [Buffer.from("usage"), dh, u64LE(epochId)],
      programId
    );

    const ownerAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      tollMint,
      payer.publicKey,
      true,
      "confirmed",
      undefined,
      TOKEN_PROGRAM_ID
    );

    const sig = await program.methods
      .claimDomainRewards(new BN(epochId.toString()), Array.from(dh))
      .accounts({
        rewardsConfig,
        owner: payer.publicKey,
        domainClaim,
        domainUsageEpoch,
        treasuryAuthority,
        treasuryVault,
        ownerTollAta: ownerAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("fqdn_normalized:", normalizeFqdn(fqdn));
    console.log("domain_hash_hex:", dh.toString("hex"));
    console.log("epoch_id:", epochId.toString());
    console.log("owner_toll_ata:", ownerAta.address.toBase58());
    console.log("tx_claim_domain_rewards:", sig);
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


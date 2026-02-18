import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import BN from "bn.js";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
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

function normalizeDomain(domain: string): string {
  let d = domain.trim().toLowerCase();
  if (d.endsWith(".")) d = d.slice(0, -1);
  if (d.length === 0 || d.length > 253) throw new Error("bad domain length");
  if (!/^[a-z0-9.-]+$/.test(d)) throw new Error("domain contains invalid chars (MVP: ascii a-z0-9.-)");
  return d;
}

function sha256Hex(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function domainHash(domainNorm: string): Uint8Array {
  return crypto.createHash("sha256").update(domainNorm, "utf8").digest();
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command("init-config", "Initialize ns incentives config (once)", (y) =>
      y
        .option("toll-mint", { type: "string", demandOption: true })
        .option("epoch-len-slots", { type: "number", default: 100 })
        .option("ns-set-hash", { type: "string", demandOption: true, describe: "hex32" })
        .option("min-attestors", { type: "number", default: 1 })
        .option("reward-per-query", { type: "string", default: "1" })
        .option("max-reward-per-epoch", { type: "string", default: "1000000" })
        .option("max-epochs-claim-range", { type: "number", default: 32 })
        .option("allowlisted-verifiers", { type: "string", describe: "comma-separated pubkeys (default: wallet pubkey)" })
    )
    .command("fund", "Fund reward vault with TOLL tokens", (y) =>
      y
        .option("toll-mint", { type: "string", demandOption: true })
        .option("amount", { type: "string", demandOption: true, describe: "integer token amount (decimals=0 assumed)" })
    )
    .command("create", "Create a domain claim", (y) =>
      y.option("domain", { type: "string", demandOption: true })
    )
    .command("revoke", "Revoke a domain claim", (y) =>
      y.option("domain", { type: "string", demandOption: true })
    )
    .command("claim-rewards", "Claim rewards for a domain across epochs", (y) =>
      y
        .option("domain", { type: "string", demandOption: true })
        .option("from-epoch", { type: "string", demandOption: true })
        .option("to-epoch", { type: "string", demandOption: true })
        .option("toll-mint", { type: "string", demandOption: true })
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
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || ".", ".config/solana/id.json");

  const payer = loadKeypair(walletPath);
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = loadIdlOrThrow("ddns_ns_incentives");
  const programIdStr =
    argv["program-id"] ||
    process.env.DDNS_NS_INCENTIVES_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpcUrl, "ddns_ns_incentives");
  if (!programIdStr) throw new Error("program id not found (use --program-id or DDNS_NS_INCENTIVES_PROGRAM_ID)");
  const programId = new PublicKey(programIdStr);
  const program = new anchor.Program({ ...(idl as any), address: programId.toBase58() }, provider);

  const [nsConfig] = PublicKey.findProgramAddressSync([Buffer.from("ns_config")], programId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([Buffer.from("vault_authority")], programId);
  const [rewardVault] = PublicKey.findProgramAddressSync([Buffer.from("reward_vault")], programId);

  console.log("rpc:", rpcUrl);
  console.log("program_id:", programId.toBase58());
  console.log("wallet_pubkey:", payer.publicKey.toBase58());
  console.log("pda_ns_config:", nsConfig.toBase58());
  console.log("pda_vault_authority:", vaultAuthority.toBase58());
  console.log("pda_reward_vault:", rewardVault.toBase58());

  const cmd = String(argv._[0]);

  if (cmd === "init-config") {
    const existing = await program.account.nsConfig.fetchNullable(nsConfig);
    if (existing) {
      console.log("ns_config_exists: true");
      return;
    }

    const tollMint = new PublicKey(argv["toll-mint"]!);
    const nsSetHashHex = String(argv["ns-set-hash"]);
    if (!/^[0-9a-fA-F]{64}$/.test(nsSetHashHex)) throw new Error("ns-set-hash must be hex32");
    const nsSetHash = Array.from(Buffer.from(nsSetHashHex, "hex"));

    const allowlisted = (argv["allowlisted-verifiers"] || payer.publicKey.toBase58())
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => new PublicKey(s));

    const sig = await program.methods
      .initializeNsConfig(
        new BN(argv["epoch-len-slots"]!),
        nsSetHash,
        argv["min-attestors"]!,
        new BN(String(argv["reward-per-query"])),
        new BN(String(argv["max-reward-per-epoch"])),
        argv["max-epochs-claim-range"]!,
        allowlisted
      )
      .accounts({
        admin: payer.publicKey,
        nsConfig,
        vaultAuthority,
        tollMint,
        rewardVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("tx_init_config:", sig);
    return;
  }

  if (cmd === "fund") {
    const tollMint = new PublicKey(argv["toll-mint"]!);
    const amount = BigInt(String(argv.amount));
    const adminFromAta = getAssociatedTokenAddressSync(tollMint, payer.publicKey);
    await getOrCreateAssociatedTokenAccount(connection, payer, tollMint, payer.publicKey);

    const sig = await program.methods
      .fundRewards(new BN(amount.toString()))
      .accounts({
        admin: payer.publicKey,
        nsConfig,
        adminFrom: adminFromAta,
        rewardVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("admin_from_ata:", adminFromAta.toBase58());
    console.log("amount:", amount.toString());
    console.log("tx_fund:", sig);
    return;
  }

  if (cmd === "create") {
    const d = normalizeDomain(argv.domain!);
    const dh = domainHash(d);
    const [nsClaim] = PublicKey.findProgramAddressSync([Buffer.from("ns_claim"), Buffer.from(dh)], programId);

    console.log("domain_norm:", d);
    console.log("domain_hash:", Buffer.from(dh).toString("hex"));
    console.log("pda_ns_claim:", nsClaim.toBase58());

    const sig = await program.methods
      .createNsClaim(d, Array.from(dh))
      .accounts({
        nsConfig,
        nsClaim,
        ownerWallet: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("tx_create_claim:", sig);
    return;
  }

  if (cmd === "revoke") {
    const d = normalizeDomain(argv.domain!);
    const dh = domainHash(d);
    const [nsClaim] = PublicKey.findProgramAddressSync([Buffer.from("ns_claim"), Buffer.from(dh)], programId);

    console.log("domain_norm:", d);
    console.log("domain_hash:", Buffer.from(dh).toString("hex"));
    console.log("pda_ns_claim:", nsClaim.toBase58());

    const sig = await program.methods
      .revokeNsClaim()
      .accounts({
        ownerWallet: payer.publicKey,
        nsClaim,
      })
      .rpc();
    console.log("tx_revoke_claim:", sig);
    return;
  }

  if (cmd === "claim-rewards") {
    const d = normalizeDomain(argv.domain!);
    const dh = domainHash(d);
    const [nsClaim] = PublicKey.findProgramAddressSync([Buffer.from("ns_claim"), Buffer.from(dh)], programId);
    const tollMint = new PublicKey(argv["toll-mint"]!);
    const ownerAta = getAssociatedTokenAddressSync(tollMint, payer.publicKey);
    await getOrCreateAssociatedTokenAccount(connection, payer, tollMint, payer.publicKey);

    const cfg: any = await program.account.nsConfig.fetch(nsConfig);
    const minAttestors = Number(cfg.minAttestors);
    const allowlisted = (cfg.allowlistedVerifiers as PublicKey[]).map((p: any) => new PublicKey(p));
    const maxRange = Number(cfg.maxEpochsClaimRange);

    const fromEpoch = BigInt(String(argv["from-epoch"]));
    const toEpoch = BigInt(String(argv["to-epoch"]));
    if (toEpoch < fromEpoch) throw new Error("to-epoch must be >= from-epoch");
    const epochs = Number(toEpoch - fromEpoch + 1n);
    if (epochs <= 0 || epochs > maxRange) throw new Error(`epoch range too large (max ${maxRange})`);

    const remaining: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];

    for (let i = 0; i < epochs; i++) {
      const epochId = fromEpoch + BigInt(i);
      const epochLe = Buffer.alloc(8);
      epochLe.writeBigUInt64LE(epochId);

      const [usagePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("ns_usage"), Buffer.from(dh), epochLe],
        programId
      );
      remaining.push({ pubkey: usagePda, isSigner: false, isWritable: false });

      const attestors = allowlisted.slice(0, minAttestors);
      for (const att of attestors) {
        const [attPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("ns_attest"), Buffer.from(dh), epochLe, att.toBuffer()],
          programId
        );
        remaining.push({ pubkey: attPda, isSigner: false, isWritable: false });
      }
    }

    console.log("domain_norm:", d);
    console.log("domain_hash:", Buffer.from(dh).toString("hex"));
    console.log("pda_ns_claim:", nsClaim.toBase58());
    console.log("owner_ata:", ownerAta.toBase58());
    console.log("remaining_accounts_count:", remaining.length);

    const sig = await program.methods
      .claimNsRewards(new BN(fromEpoch.toString()), new BN(toEpoch.toString()))
      .accounts({
        nsConfig,
        nsClaim,
        ownerWallet: payer.publicKey,
        rewardVault,
        vaultAuthority,
        ownerTokenAccount: ownerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(remaining)
      .rpc();

    console.log("tx_claim_rewards:", sig);
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


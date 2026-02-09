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
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
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

  // Sizes for init instructions.
  const sizeMap: Record<string, number> = {
    Config: 8 + 145,
    DomainOwner: 8 + 81,
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

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function nameHash(name: string): Buffer {
  const n = name.trim().toLowerCase();
  return sha256(Buffer.from(n, "utf8"));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command("init", "Init config + vaults (once)", (y) =>
      y
        .option("toll-mint", { type: "string", demandOption: true })
        .option("default-owner-bps", { type: "number", default: 0 })
        .option("default-miners-bps", { type: "number", default: 7000 })
        .option("default-treasury-bps", { type: "number", default: 3000 })
        .option("min-toll-amount", { type: "string", default: "1" })
        .option("enabled", { type: "boolean", default: true })
    )
    .command("register", "Register DomainOwner for a name_hash", (y) =>
      y
        .option("name", { type: "string", demandOption: true })
        .option("owner-bps", { type: "number", demandOption: true })
        .option("miners-bps", { type: "number", demandOption: true })
        .option("treasury-bps", { type: "number", demandOption: true })
    )
    .command("pay", "Pay toll for a route and split", (y) =>
      y
        .option("name", { type: "string", demandOption: true })
        .option("amount", { type: "string", demandOption: true, describe: "TOLL base units" })
        .option("owner-wallet", { type: "string", describe: "If domain owner exists, pass owner wallet pubkey" })
        .option("owner-ata", { type: "string", describe: "If domain owner exists, pass owner payout ATA" })
    )
    .command("mint-test-toll", "Localnet helper: create a TOLL mint and mint to wallet", (y) =>
      y.option("amount", { type: "string", default: "1000000000" })
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

  const idl = loadIdlOrThrow("ddns_domain_rewards");
  const programIdStr =
    argv["program-id"] ||
    process.env.DDNS_DOMAIN_REWARDS_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpcUrl, "ddns_domain_rewards");
  if (!programIdStr) throw new Error("ddns_domain_rewards program id not found; set DDNS_DOMAIN_REWARDS_PROGRAM_ID");
  const programId = new PublicKey(programIdStr);
  const idlWithAddress = { ...(idl as any), address: programId.toBase58() };
  const program = new anchor.Program(idlWithAddress as any, provider);

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([Buffer.from("vault_authority")], programId);

  console.log("rpc:", rpcUrl);
  console.log("ddns_domain_rewards_program_id:", programId.toBase58());
  console.log("wallet_pubkey:", payer.publicKey.toBase58());
  console.log("pda_config:", config.toBase58());
  console.log("pda_vault_authority:", vaultAuthority.toBase58());

  const cmd = String(argv._[0]);

  if (cmd === "mint-test-toll") {
    const mint = await createMint(connection, payer, payer.publicKey, null, 9);
    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    await mintTo(connection, payer, mint, ata.address, payer, BigInt(String((argv as any).amount)));
    console.log("toll_mint:", mint.toBase58());
    console.log("wallet_toll_ata:", ata.address.toBase58());
    return;
  }

  if (cmd === "init") {
    const existing: any = await program.account.config.fetchNullable(config);
    if (existing) {
      console.log("config_exists: true");
      console.log("treasury_vault:", existing.treasuryVault.toBase58());
      console.log("miners_vault:", existing.minersVault.toBase58());
      return;
    }

    const tollMint = new PublicKey(String((argv as any)["toll-mint"]));
    const treasuryVault = Keypair.generate();
    const minersVault = Keypair.generate();

    const sig = await program.methods
      .initConfig(
        Number((argv as any)["default-owner-bps"]),
        Number((argv as any)["default-miners-bps"]),
        Number((argv as any)["default-treasury-bps"]),
        new BN(String((argv as any)["min-toll-amount"])),
        Boolean((argv as any).enabled)
      )
      .accounts({
        authority: payer.publicKey,
        config,
        tollMint,
        vaultAuthority,
        treasuryVault: treasuryVault.publicKey,
        minersVault: minersVault.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([treasuryVault, minersVault])
      .rpc();

    console.log("treasury_vault:", treasuryVault.publicKey.toBase58());
    console.log("miners_vault:", minersVault.publicKey.toBase58());
    console.log("tx_init_config:", sig);
    return;
  }

  const cfg: any = await program.account.config.fetchNullable(config);
  if (!cfg) throw new Error("config missing; run: npm -C solana run domain-rewards -- init ...");

  if (cmd === "register") {
    const name = String((argv as any).name);
    const nh = nameHash(name);
    const [domainOwner] = PublicKey.findProgramAddressSync([Buffer.from("domain_owner"), nh], programId);
    const sig = await program.methods
      .registerDomainOwner(
        Array.from(nh),
        Number((argv as any)["owner-bps"]),
        Number((argv as any)["miners-bps"]),
        Number((argv as any)["treasury-bps"])
      )
      .accounts({
        ownerWallet: payer.publicKey,
        config,
        domainOwner,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("name:", name);
    console.log("name_hash_hex:", nh.toString("hex"));
    console.log("pda_domain_owner:", domainOwner.toBase58());
    console.log("tx_register_domain_owner:", sig);
    return;
  }

  if (cmd === "pay") {
    const name = String((argv as any).name);
    const nh = nameHash(name);
    const [domainOwner] = PublicKey.findProgramAddressSync([Buffer.from("domain_owner"), nh], programId);
    const amount = new BN(String((argv as any).amount));

    const tollMint = new PublicKey(cfg.tollMint);
    const payerAta = await getOrCreateAssociatedTokenAccount(connection, payer, tollMint, payer.publicKey, true);

    // If owner is unknown, allow placeholders (owner share will be 0 in defaults).
    const ownerWallet = (argv as any)["owner-wallet"] ? new PublicKey(String((argv as any)["owner-wallet"])) : payer.publicKey;
    const ownerAtaPk = (argv as any)["owner-ata"]
      ? new PublicKey(String((argv as any)["owner-ata"]))
      : (await getOrCreateAssociatedTokenAccount(connection, payer, tollMint, ownerWallet, true)).address;

    const sig = await program.methods
      .tollPayForRoute(Array.from(nh), amount)
      .accounts({
        config,
        payer: payer.publicKey,
        payerTollAta: payerAta.address,
        domainOwner,
        ownerPayoutAta: ownerAtaPk,
        vaultAuthority,
        treasuryVault: new PublicKey(cfg.treasuryVault),
        minersVault: new PublicKey(cfg.minersVault),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("name:", name);
    console.log("name_hash_hex:", nh.toString("hex"));
    console.log("amount:", amount.toString());
    console.log("tx_toll_pay_for_route:", sig);
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


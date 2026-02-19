import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import * as anchor from "@coral-xyz/anchor";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  TOKEN_PROGRAM_ID,
    createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const DEFAULT_RPC =
  process.env.ANCHOR_PROVIDER_URL || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DEFAULT_WALLET =
  process.env.ANCHOR_WALLET || path.join(process.env.HOME || ".", ".config/solana/id.json");
const DEFAULT_PROGRAM_ID =
  process.env.DDNS_WITNESS_REWARDS_PROGRAM_ID || "3nJNSWdN5d3kihzPi5VzcGUL2psFuZgveSQAffg6bb5V";

function u64Le(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value);
  return b;
}

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdl(): Idl {
  const solanaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const p = path.join(solanaDir, "target", "idl", "ddns_witness_rewards.json");
  if (!fs.existsSync(p)) {
    throw new Error(`missing_idl:${p}. Run: anchor build --program-name ddns_witness_rewards`);
  }
  const idl = JSON.parse(fs.readFileSync(p, "utf8")) as any;

  // Anchor 0.32 can emit IDLs where `accounts[]` only have name+discriminator and the struct
  // type lives in `types[]`. Anchor TS expects `accounts[].type` to exist for account clients.
  if (Array.isArray(idl.accounts) && Array.isArray(idl.types)) {
    const byName = new Map<string, any>();
    for (const t of idl.types) byName.set(t.name, t.type);
    for (const a of idl.accounts) {
      if (!a.type) {
        const t = byName.get(a.name);
        if (t) a.type = t;
      }
    }
  }

  // Provide sizes for Anchor TS account clients (8-byte discriminator + fixed struct sizes).
  const accountSizes: Record<string, number> = {
    WitnessRewardsConfig: 8 + 143,
    MinerBond: 8 + 49,
    EpochMinerStats: 8 + 104,
    EpochState: 8 + 33,
  };
  if (Array.isArray(idl.accounts)) {
    for (const a of idl.accounts) {
      if (a.size == null && typeof a.name === "string" && accountSizes[a.name] != null) {
        a.size = accountSizes[a.name];
      }
    }
  }

  return idl as Idl;
}

function readProgramIdFromAnchorToml(rpcUrl: string): string | null {
  try {
    const tomlPath = path.resolve("Anchor.toml");
    if (!fs.existsSync(tomlPath)) return null;
    const content = fs.readFileSync(tomlPath, "utf8");
    const isLocal = /127\\.0\\.0\\.1|localhost/.test(rpcUrl);
    const section = isLocal ? "programs.localnet" : "programs.devnet";
    const re = new RegExp(`\\\\[${section}\\\\][^\\\\[]*?ddns_witness_rewards\\\\s*=\\\\s*\\\"([^\\\"]+)\\\"`, "s");
    const match = content.match(re);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function fetchDecoded(
  connection: Connection,
  coder: BorshAccountsCoder,
  pubkey: PublicKey,
  accountName: string
): Promise<any | null> {
  const info = await connection.getAccountInfo(pubkey);
  if (!info) return null;
  return coder.decode(accountName, info.data);
}

function requireHex32(name: string, hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error(`${name}_must_be_32_byte_hex`);
  return Uint8Array.from(Buffer.from(h, "hex"));
}

function derivePdas(programId: PublicKey, miner: PublicKey, epochId?: bigint) {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("witness_rewards_config")], programId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([Buffer.from("witness_rewards_vault_authority")], programId);
  const [bond] = PublicKey.findProgramAddressSync([Buffer.from("bond"), miner.toBuffer()], programId);

  let epochState: PublicKey | null = null;
  let epochStats: PublicKey | null = null;
  if (epochId !== undefined) {
    const seed = u64Le(epochId);
    epochState = PublicKey.findProgramAddressSync([Buffer.from("epoch_state"), seed], programId)[0];
    epochStats = PublicKey.findProgramAddressSync([Buffer.from("epoch_stats"), seed, miner.toBuffer()], programId)[0];
  }
  return { config, vaultAuthority, bond, epochState, epochStats };
}

async function loadProgram(opts: { rpc: string; walletPath: string; programId: string }) {
  const payer = loadKeypair(opts.walletPath);
  const connection = new Connection(opts.rpc, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = loadIdl();
  const coder = new BorshAccountsCoder(idl);
  const programId = new PublicKey(opts.programId);
  const program = new anchor.Program(idl as any, provider);
  return { payer, connection, provider, coder, programId, program };
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("witness-rewards")
    .option("rpc", { type: "string", default: DEFAULT_RPC })
    .option("wallet", { type: "string", default: DEFAULT_WALLET })
    .option("program-id", {
      type: "string",
      default: DEFAULT_PROGRAM_ID,
      describe: "or set DDNS_WITNESS_REWARDS_PROGRAM_ID; falls back to Anchor.toml if unset",
    })
    .command(
      "init-config",
      "Create config PDA (and optionally create a new mint + reward vault)",
      (cmd) =>
        cmd
          .option("epoch-len-slots", { type: "number", default: 100 })
          .option("max-reward-per-epoch", { type: "string", default: "1000000000" })
          .option("min-bond-lamports", { type: "string", default: "1000000" })
          .option("reward-per-receipt", { type: "string", default: "1000" })
          .option("max-rewardable", { type: "number", default: 1000 })
          .option("cooldown-slots", { type: "string", default: "0" })
          .option("enabled", { type: "boolean", default: true })
          .option("toll-mint", { type: "string", describe: "if omitted, creates a new mint" })
          .option("reward-vault", {
            type: "string",
            describe: "if omitted, creates a token account owned by vault authority PDA",
          })
          .option("mint-decimals", { type: "number", default: 9 })
          .option("mint-to-self", {
            type: "string",
            default: "0",
            describe: "if creating a new mint, mint this amount to your ATA (for funding)",
          }),
      async (args) => {
        const rpc = String(args.rpc);
        const walletPath = String(args.wallet);
        const programIdStr = String(args["program-id"] || "") || readProgramIdFromAnchorToml(rpc) || DEFAULT_PROGRAM_ID;
        const { payer, connection, programId, program } = await loadProgram({ rpc, walletPath, programId: programIdStr });

        const pdas = derivePdas(programId, payer.publicKey);

        let tollMint = args["toll-mint"] ? new PublicKey(String(args["toll-mint"])) : null;
        if (!tollMint) {
          tollMint = await createMint(connection, payer, payer.publicKey, null, args["mint-decimals"] as number);
          const mintToSelf = BigInt(String(args["mint-to-self"]));
          if (mintToSelf > 0n) {
            const ata = await getOrCreateAssociatedTokenAccount(connection, payer, tollMint, payer.publicKey);
            await mintTo(connection, payer, tollMint, ata.address, payer, mintToSelf);
          }
        }

        let rewardVault = args["reward-vault"] ? new PublicKey(String(args["reward-vault"])) : null;
        if (!rewardVault) {
          rewardVault = await createAssociatedTokenAccount(connection, payer, tollMint, pdas.vaultAuthority, undefined, TOKEN_PROGRAM_ID, undefined, true);
        }

        const sig = await program.methods
          .initConfig(
            new BN(args["epoch-len-slots"] as number),
            new BN(String(args["max-reward-per-epoch"])),
            new BN(String(args["min-bond-lamports"])),
            new BN(String(args["reward-per-receipt"])),
            args["max-rewardable"] as number,
            new BN(String(args["cooldown-slots"])),
            args.enabled as boolean
          )
          .accounts({
            authority: payer.publicKey,
            tollMint,
            config: pdas.config,
            vaultAuthority: pdas.vaultAuthority,
            rewardVault,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .rpc();

        console.log(
          JSON.stringify(
            {
              tx: sig,
              rpc,
              programId: programId.toBase58(),
              authority: payer.publicKey.toBase58(),
              pda: {
                config: pdas.config.toBase58(),
                vaultAuthority: pdas.vaultAuthority.toBase58(),
              },
              tollMint: tollMint.toBase58(),
              rewardVault: rewardVault.toBase58(),
            },
            null,
            2
          )
        );
      }
    )
    .command(
      "deposit-bond",
      "Deposit SOL bond (lamports) to MinerBond PDA",
      (cmd) => cmd.option("lamports", { type: "string", demandOption: true }),
      async (args) => {
        const rpc = String(args.rpc);
        const walletPath = String(args.wallet);
        const programIdStr = String(args["program-id"] || "") || readProgramIdFromAnchorToml(rpc) || DEFAULT_PROGRAM_ID;
        const { payer, connection, coder, programId, program } = await loadProgram({ rpc, walletPath, programId: programIdStr });

        const pdas = derivePdas(programId, payer.publicKey);
        const sig = await program.methods
          .depositBond(new BN(String(args.lamports)))
          .accounts({
            miner: payer.publicKey,
            config: pdas.config,
            bond: pdas.bond,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const bond = await fetchDecoded(connection, coder, pdas.bond, "MinerBond");
        console.log(JSON.stringify({ tx: sig, bondPda: pdas.bond.toBase58(), post: { bond } }, null, 2));
      }
    )
    .command(
      "fund-reward-vault",
      "Fund reward vault from authority ATA",
      (cmd) =>
        cmd
          .option("amount", { type: "string", demandOption: true })
          .option("funder-ata", { type: "string", describe: "defaults to ATA(toll_mint,funder)" }),
      async (args) => {
        const rpc = String(args.rpc);
        const walletPath = String(args.wallet);
        const programIdStr = String(args["program-id"] || "") || readProgramIdFromAnchorToml(rpc) || DEFAULT_PROGRAM_ID;
        const { payer, connection, coder, programId, program } = await loadProgram({ rpc, walletPath, programId: programIdStr });

        const pdas = derivePdas(programId, payer.publicKey);
        const cfg = await fetchDecoded(connection, coder, pdas.config, "WitnessRewardsConfig");
        if (!cfg) throw new Error("config_not_found");
        const tollMint = new PublicKey(cfg.toll_mint);
        const rewardVault = new PublicKey(cfg.reward_vault);
        const funderAta = args["funder-ata"]
          ? new PublicKey(String(args["funder-ata"]))
          : getAssociatedTokenAddressSync(tollMint, payer.publicKey, true);

        const sig = await program.methods
          .fundRewardVault(new BN(String(args.amount)))
          .accounts({
            funder: payer.publicKey,
            config: pdas.config,
            funderAta,
            rewardVault,
            tokenProgram: TOKEN_PROGRAM_ID,
            vaultAuthority: pdas.vaultAuthority,
          })
          .rpc();

        console.log(JSON.stringify({ tx: sig, tollMint: tollMint.toBase58(), rewardVault: rewardVault.toBase58() }, null, 2));
      }
    )
    .command(
      "submit-batch",
      "Submit a receipt batch for the current epoch",
      (cmd) =>
        cmd
          .option("root-hex", { type: "string", demandOption: true, describe: "32-byte hex; include 0x ok" })
          .option("receipt-count", { type: "number", demandOption: true })
          .option("unique-names", { type: "number", demandOption: true })
          .option("unique-colos", { type: "number", demandOption: true })
          .option("epoch", { type: "string", describe: "defaults to current epoch (slot / epoch_len_slots)" }),
      async (args) => {
        const rpc = String(args.rpc);
        const walletPath = String(args.wallet);
        const programIdStr = String(args["program-id"] || "") || readProgramIdFromAnchorToml(rpc) || DEFAULT_PROGRAM_ID;
        const { payer, connection, coder, programId, program } = await loadProgram({ rpc, walletPath, programId: programIdStr });

        const basePdas = derivePdas(programId, payer.publicKey);
        const cfg = await fetchDecoded(connection, coder, basePdas.config, "WitnessRewardsConfig");
        if (!cfg) throw new Error("config_not_found");
        const epochLen = BigInt(cfg.epoch_len_slots.toString());
        const slot = await connection.getSlot("confirmed");
        const currentEpoch = epochLen > 0n ? BigInt(slot) / epochLen : 0n;
        const epochId = args.epoch ? BigInt(String(args.epoch)) : currentEpoch;

        const pdas = derivePdas(programId, payer.publicKey, epochId);
        if (!pdas.epochStats || !pdas.epochState) throw new Error("pda_derivation_failed");

        const root = requireHex32("root", String(args["root-hex"]));
        const sig = await program.methods
          .submitReceiptBatch(
            new BN(epochId.toString()),
            Array.from(root),
            args["receipt-count"] as number,
            args["unique-names"] as number,
            args["unique-colos"] as number
          )
          .accounts({
            miner: payer.publicKey,
            config: pdas.config,
            bond: pdas.bond,
            epochStats: pdas.epochStats,
            epochState: pdas.epochState,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        const epochStats = await fetchDecoded(connection, coder, pdas.epochStats, "EpochMinerStats");
        const epochState = await fetchDecoded(connection, coder, pdas.epochState, "EpochState");

        console.log(
          JSON.stringify(
            {
              tx: sig,
              epochId: epochId.toString(),
              pda: { epochStats: pdas.epochStats.toBase58(), epochState: pdas.epochState.toBase58() },
              post: { epochStats, epochState },
            },
            null,
            2
          )
        );
      }
    )
    .command(
      "claim",
      "Claim rewards for an epoch (transfers from reward vault to miner ATA)",
      (cmd) => cmd.option("epoch", { type: "string", demandOption: true }),
      async (args) => {
        const rpc = String(args.rpc);
        const walletPath = String(args.wallet);
        const programIdStr = String(args["program-id"] || "") || readProgramIdFromAnchorToml(rpc) || DEFAULT_PROGRAM_ID;
        const { payer, connection, coder, programId, program } = await loadProgram({ rpc, walletPath, programId: programIdStr });

        const basePdas = derivePdas(programId, payer.publicKey);
        const cfg = await fetchDecoded(connection, coder, basePdas.config, "WitnessRewardsConfig");
        if (!cfg) throw new Error("config_not_found");
        const tollMint = new PublicKey(cfg.toll_mint);
        const rewardVault = new PublicKey(cfg.reward_vault);

        const epochId = BigInt(String(args.epoch));
        const pdas = derivePdas(programId, payer.publicKey, epochId);
        if (!pdas.epochStats) throw new Error("pda_derivation_failed");

        const minerAta = await getOrCreateAssociatedTokenAccount(connection, payer, tollMint, payer.publicKey);

        const sig = await program.methods
          .claimRewards(new BN(epochId.toString()))
          .accounts({
            miner: payer.publicKey,
            config: basePdas.config,
            vaultAuthority: basePdas.vaultAuthority,
            rewardVault,
            epochStats: pdas.epochStats,
            minerTollAta: minerAta.address,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        const epochStats = await fetchDecoded(connection, coder, pdas.epochStats, "EpochMinerStats");
        const bal = await connection.getTokenAccountBalance(minerAta.address);
        console.log(
          JSON.stringify(
            {
              tx: sig,
              epochId: epochId.toString(),
              tollMint: tollMint.toBase58(),
              rewardVault: rewardVault.toBase58(),
              minerAta: minerAta.address.toBase58(),
              post: { epochStats, minerAtaAmount: bal?.value?.amount },
            },
            null,
            2
          )
        );
      }
    )
    .command(
      "status",
      "Show PDAs and decoded accounts (config/bond/epoch stats/state)",
      (cmd) =>
        cmd.option("miner", { type: "string", demandOption: true }).option("epoch", { type: "string" }),
      async (args) => {
        const rpc = String(args.rpc);
        const programIdStr = String(args["program-id"] || "") || readProgramIdFromAnchorToml(rpc) || DEFAULT_PROGRAM_ID;
        const connection = new Connection(rpc, "confirmed");
        const programId = new PublicKey(programIdStr);
        const miner = new PublicKey(String(args.miner));

        const idl = loadIdl();
        const coder = new BorshAccountsCoder(idl);

        const epochId = args.epoch ? BigInt(String(args.epoch)) : undefined;
        const pdas = derivePdas(programId, miner, epochId);

        const cfg = await fetchDecoded(connection, coder, pdas.config, "WitnessRewardsConfig");
        const bond = await fetchDecoded(connection, coder, pdas.bond, "MinerBond");
        const epochState = pdas.epochState ? await fetchDecoded(connection, coder, pdas.epochState, "EpochState") : null;
        const epochStats = pdas.epochStats ? await fetchDecoded(connection, coder, pdas.epochStats, "EpochMinerStats") : null;

        console.log(
          JSON.stringify(
            {
              rpc,
              programId: programId.toBase58(),
              miner: miner.toBase58(),
              epoch: epochId !== undefined ? epochId.toString() : null,
              pda: {
                config: pdas.config.toBase58(),
                vaultAuthority: pdas.vaultAuthority.toBase58(),
                bond: pdas.bond.toBase58(),
                ...(pdas.epochState ? { epochState: pdas.epochState.toBase58() } : {}),
                ...(pdas.epochStats ? { epochStats: pdas.epochStats.toBase58() } : {}),
              },
              accounts: { config: cfg, bond, epochState, epochStats },
            },
            null,
            2
          )
        );
      }
    )
    .demandCommand(1)
    .strict()
    .help()
    .parseAsync();

  return argv;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
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

  // Anchor expects `idl.name`/`idl.version` at the top-level (some generators only fill metadata).
  if (!idl.name && idl.metadata?.name) idl.name = idl.metadata.name;
  if (!idl.version && idl.metadata?.version) idl.version = idl.metadata.version;

  // Anchor JS expects account sizes; `anchor-spl/idl-build` is not enabled in this repo yet.
  const sizeMap: Record<string, number> = {
    StakeConfig: 8 + 99,
    StakePosition: 8 + 89,
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

function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * 1_000_000_000));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command("init", "Initialize ddns_stake config + reward mint (once)", (y) =>
      y
        .option("epoch-len-slots", { type: "number", default: 100 })
        .option("reward-rate-per-epoch", { type: "number", default: 1_000_000 })
        .option("min-lock-epochs", { type: "number", default: 1 })
    )
    .command("stake", "Stake SOL (lamports) into the stake vault PDA", (y) =>
      y.option("amount-sol", { type: "number", demandOption: true })
    )
    .command("unstake", "Unstake SOL (lamports) if unlocked", (y) =>
      y.option("amount-sol", { type: "number", demandOption: true })
    )
    .command("claim", "Claim TOLL rewards for elapsed epochs", (y) => y)
    .command("delegate", "Delegate stake weight to a verifier pubkey (MVP)", (y) =>
      y.option("verifier", { type: "string", demandOption: true })
    )
    .command("status", "Print key PDAs and on-chain stake state", (y) => y)
    .option("rpc", { type: "string", describe: "RPC URL override" })
    .option("wallet", { type: "string", describe: "Wallet keypair path override" })
    .option("program-id", { type: "string", describe: "ddns_stake program id override" })
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

  const idl = loadIdlOrThrow("ddns_stake");

  const programIdStr =
    argv["program-id"] ||
    process.env.DDNS_STAKE_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpcUrl, "ddns_stake") ||
    "6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF";
  const programId = new PublicKey(programIdStr);
  const idlWithAddress = { ...(idl as any), address: programId.toBase58() };
  const program = new anchor.Program(idlWithAddress as any, provider);

  const [stakeConfig] = PublicKey.findProgramAddressSync([Buffer.from("stake_config")], programId);
  const [stakeVault] = PublicKey.findProgramAddressSync([Buffer.from("stake_vault")], programId);
  const [mintAuthority] = PublicKey.findProgramAddressSync([Buffer.from("mint_authority")], programId);
  const [stakePosition] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), payer.publicKey.toBuffer()],
    programId
  );

  console.log("rpc:", rpcUrl);
  console.log("ddns_stake_program_id:", programId.toBase58());
  console.log("wallet_pubkey:", payer.publicKey.toBase58());
  console.log("pda_stake_config:", stakeConfig.toBase58());
  console.log("pda_stake_vault:", stakeVault.toBase58());
  console.log("pda_mint_authority:", mintAuthority.toBase58());
  console.log("pda_stake_position:", stakePosition.toBase58());

  const cmd = String(argv._[0]);

  if (cmd === "status") {
    const cfg: any = await program.account.stakeConfig.fetchNullable(stakeConfig);
    const pos: any = await program.account.stakePosition.fetchNullable(stakePosition);
    console.log("stake_config:", cfg ? {
      epoch_len_slots: cfg.epochLenSlots.toString(),
      reward_rate_per_epoch: cfg.rewardRatePerEpoch.toString(),
      min_lock_epochs: cfg.minLockEpochs.toString(),
      reward_mint: cfg.rewardMint.toBase58(),
      total_stake: cfg.totalStake.toString(),
    } : null);
    console.log("stake_position:", pos ? {
      staked_amount: pos.stakedAmount.toString(),
      last_claimed_epoch: pos.lastClaimedEpoch.toString(),
      locked_until_epoch: pos.lockedUntilEpoch.toString(),
      delegate_to_verifier: pos.delegateToVerifier.toBase58(),
    } : null);
    return;
  }

  if (cmd === "init") {
    const existing = await program.account.stakeConfig.fetchNullable(stakeConfig);
    if (existing) {
      console.log("stake_config_exists: true");
      return;
    }

    const rewardMint = await createMint(
      connection,
      payer,
      mintAuthority, // mint authority PDA
      null,
      0,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    const sig = await program.methods
      .initStakeConfig(
        new BN(argv["epoch-len-slots"]!),
        new BN(argv["reward-rate-per-epoch"]!),
        new BN(argv["min-lock-epochs"]!)
      )
      .accounts({
        authority: payer.publicKey,
        stakeConfig,
        stakeVault,
        mintAuthority,
        rewardMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("reward_mint:", rewardMint.toBase58());
    console.log("tx_init_stake_config:", sig);
    return;
  }

  const cfg: any = await program.account.stakeConfig.fetchNullable(stakeConfig);
  if (!cfg) {
    throw new Error("stake_config missing; run: npm -C solana run stake -- init");
  }
  const rewardMintPk = new PublicKey(cfg.rewardMint);

  if (cmd === "stake") {
    const amountLamports = solToLamports(argv["amount-sol"]!);
    const sig = await program.methods
      .stake(new BN(amountLamports.toString()))
      .accounts({
        owner: payer.publicKey,
        stakeConfig,
        stakeVault,
        stakePosition,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("amount_lamports:", amountLamports.toString());
    console.log("tx_stake:", sig);
    return;
  }

  if (cmd === "unstake") {
    const amountLamports = solToLamports(argv["amount-sol"]!);
    const sig = await program.methods
      .unstake(new BN(amountLamports.toString()))
      .accounts({
        owner: payer.publicKey,
        stakeConfig,
        stakeVault,
        stakePosition,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("amount_lamports:", amountLamports.toString());
    console.log("tx_unstake:", sig);
    return;
  }

  if (cmd === "delegate") {
    const verifier = new PublicKey(argv.verifier!);
    const sig = await program.methods
      .delegateToVerifier(verifier)
      .accounts({
        owner: payer.publicKey,
        stakePosition,
      })
      .rpc();
    console.log("verifier:", verifier.toBase58());
    console.log("tx_delegate:", sig);
    return;
  }

  if (cmd === "claim") {
    // Ensure the user's ATA exists.
    const userRewardAta = getAssociatedTokenAddressSync(rewardMintPk, payer.publicKey);
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      rewardMintPk,
      payer.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_PROGRAM_ID
    );

    const sig = await program.methods
      .claimRewards()
      .accounts({
        owner: payer.publicKey,
        stakeConfig,
        stakePosition,
        rewardMint: rewardMintPk,
        mintAuthority,
        userRewardAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("reward_mint:", rewardMintPk.toBase58());
    console.log("user_reward_ata:", userRewardAta.toBase58());
    console.log("tx_claim_rewards:", sig);
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

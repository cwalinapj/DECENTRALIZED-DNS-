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
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdl() {
  const idlPath = path.resolve("target/idl/ddns_stake_gov.json");
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
      `\\[${section}\\][^\\[]*?ddns_stake_gov\\s*=\\s*\"([^\"]+)\"`,
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

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function pda(programId: PublicKey, seeds: (Buffer | Uint8Array)[]) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command("init-config", "Initialize stake governance config", (y) =>
      y
        .option("stake-mint", { type: "string", describe: "SPL mint for stake token (defaults to new mint)" })
        .option("vault-keypair", {
          type: "string",
          demandOption: true,
          describe: "Path to a new keypair to be created as the vault token account",
        })
        .option("epoch-len-slots", { type: "number", default: 100 })
        .option("min-stake", { type: "string", default: "1000000000" })
        .option("max-verifiers", { type: "number", default: 64 })
        .option("dispute-window-epochs", { type: "number", default: 10 })
        .option("exit-cooldown-epochs", { type: "number", default: 2 })
        .option("min-lock-epochs", { type: "number", default: 1 })
        .option("max-lock-epochs", { type: "number", default: 365 })
        .option("jail-epochs-after-slash", { type: "number", default: 10 })
        .option("max-slash-bps", { type: "number", default: 5000 })
        .option("slash-authorities", { type: "string", describe: "Comma-separated pubkeys (default: wallet)" })
        .option("snapshot-submitters", { type: "string", describe: "Comma-separated pubkeys (default: wallet)" })
    )
    .command("register-verifier", "Register a verifier (authority only)", (y) =>
      y.option("verifier", { type: "string", demandOption: true }).option("commission-bps", { type: "number", default: 0 })
    )
    .command("set-verifier-active", "Set verifier active flag (authority only)", (y) =>
      y.option("verifier", { type: "string", demandOption: true }).option("active", { type: "boolean", default: true })
    )
    .command("init-position", "Initialize a stake position for the wallet", (y) => y)
    .command("stake", "Stake tokens into the governance vault", (y) =>
      y.option("amount", { type: "string", demandOption: true, describe: "Amount in base units" })
    )
    .command("lock", "Lock a portion of your stake", (y) =>
      y.option("amount", { type: "string", demandOption: true }).option("epochs", { type: "number", demandOption: true })
    )
    .command("unlock-expired", "Unlock if lock_end_epoch passed", (y) => y)
    .command("request-exit", "Request exit withdrawal (cooldown applies)", (y) =>
      y.option("amount", { type: "string", demandOption: true })
    )
    .command("finalize-withdraw", "Finalize withdrawal after cooldown", (y) => y)
    .command("delegate", "Delegate to a verifier (or none)", (y) =>
      y.option("to", { type: "string", demandOption: true, describe: "Verifier pubkey or 'none'" })
    )
    .command("set-delegation-slashable", "Set delegation_slashable flag", (y) =>
      y.option("enabled", { type: "boolean", demandOption: true })
    )
    .command("status", "Print config + your position + current epoch", (y) => y)
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
    process.env.DDNS_STAKE_GOV_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpcUrl);
  if (!programIdStr) throw new Error("program id not found (set --program-id or DDNS_STAKE_GOV_PROGRAM_ID)");
  const programId = new PublicKey(programIdStr);
  const program = new anchor.Program(idl as any, programId, provider);

  const configPda = pda(programId, [Buffer.from("stake_gov_config")]);
  const vaultAuthority = pda(programId, [Buffer.from("stake_gov_vault_authority")]);
  const registryPda = pda(programId, [Buffer.from("verifier_registry")]);
  const positionPda = pda(programId, [Buffer.from("stake"), payer.publicKey.toBuffer()]);

  const cmd = argv._[0];

  if (cmd === "init-config") {
    const vaultKpPath = argv["vault-keypair"] as string;
    const vaultKp = loadKeypair(vaultKpPath);

    let stakeMint = argv["stake-mint"] ? new PublicKey(argv["stake-mint"] as string) : null;
    if (!stakeMint) {
      // Convenience for localnet: create a new mint controlled by the wallet.
      stakeMint = await createMint(connection, payer, payer.publicKey, null, 9);
      console.log("created stake_mint:", stakeMint.toBase58());
      const ata = await getOrCreateAssociatedTokenAccount(connection, payer, stakeMint, payer.publicKey);
      await mintTo(connection, payer, stakeMint, ata.address, payer, 1_000_000_000_000n);
      console.log("minted stake tokens to:", ata.address.toBase58());
    }

    const lockTiers = [
      { lockEpochs: new BN(1), multiplierBps: 10000 },
      { lockEpochs: new BN(7), multiplierBps: 11000 },
      { lockEpochs: new BN(30), multiplierBps: 12500 },
      { lockEpochs: new BN(90), multiplierBps: 15000 },
      { lockEpochs: new BN(180), multiplierBps: 17500 },
      { lockEpochs: new BN(365), multiplierBps: 20000 },
    ];

    const slashAuthorities =
      (argv["slash-authorities"] as string | undefined)?.split(",").filter(Boolean).map((s) => new PublicKey(s)) ||
      [payer.publicKey];
    const snapshotSubmitters =
      (argv["snapshot-submitters"] as string | undefined)
        ?.split(",")
        .filter(Boolean)
        .map((s) => new PublicKey(s)) || [payer.publicKey];

    const sig = await program.methods
      .initConfig(
        stakeMint,
        new BN(argv["epoch-len-slots"] as number),
        new BN(argv["min-stake"] as string),
        argv["max-verifiers"] as number,
        new BN(argv["dispute-window-epochs"] as number),
        new BN(argv["exit-cooldown-epochs"] as number),
        new BN(argv["min-lock-epochs"] as number),
        new BN(argv["max-lock-epochs"] as number),
        new BN(argv["jail-epochs-after-slash"] as number),
        argv["max-slash-bps"] as number,
        lockTiers as any,
        slashAuthorities,
        snapshotSubmitters
      )
      .accounts({
        config: configPda,
        verifierRegistry: registryPda,
        vaultAuthority,
        vault: vaultKp.publicKey,
        stakeMint,
        authority: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([vaultKp])
      .rpc();

    console.log(JSON.stringify({ programId: programId.toBase58(), configPda: configPda.toBase58(), vaultAuthority: vaultAuthority.toBase58(), vault: vaultKp.publicKey.toBase58(), stakeMint: stakeMint.toBase58(), tx: sig }, null, 2));
    return;
  }

  if (cmd === "register-verifier") {
    const verifier = new PublicKey(argv.verifier as string);
    const sig = await program.methods
      .registerVerifier(verifier, argv["commission-bps"] as number)
      .accounts({
        config: configPda,
        verifierRegistry: registryPda,
        authority: payer.publicKey,
      })
      .rpc();
    console.log(JSON.stringify({ tx: sig, verifier: verifier.toBase58(), registryPda: registryPda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "set-verifier-active") {
    const verifier = new PublicKey(argv.verifier as string);
    const sig = await program.methods
      .setVerifierActive(verifier, argv.active as boolean)
      .accounts({
        config: configPda,
        verifierRegistry: registryPda,
        authority: payer.publicKey,
      })
      .rpc();
    console.log(JSON.stringify({ tx: sig, verifier: verifier.toBase58(), active: argv.active }, null, 2));
    return;
  }

  if (cmd === "init-position") {
    const sig = await program.methods
      .initStakePosition()
      .accounts({
        config: configPda,
        stakePosition: positionPda,
        staker: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(JSON.stringify({ tx: sig, stakePositionPda: positionPda.toBase58() }, null, 2));
    return;
  }

  if (cmd === "stake") {
    const cfg: any = await program.account.stakeGovConfig.fetch(configPda);
    const stakeMint = new PublicKey(cfg.stakeMint);
    const vault = new PublicKey(cfg.vault);
    const stakerAta = getAssociatedTokenAddressSync(stakeMint, payer.publicKey);

    const sig = await program.methods
      .stake(new BN(argv.amount as string))
      .accounts({
        config: configPda,
        vaultAuthority,
        vault,
        stakePosition: positionPda,
        stakerAta,
        staker: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const pos: any = await program.account.stakePosition.fetch(positionPda);
    console.log(JSON.stringify({ tx: sig, stakePositionPda: positionPda.toBase58(), stakerAta: stakerAta.toBase58(), vault: vault.toBase58(), stakedAmount: pos.stakedAmount.toString() }, null, 2));
    return;
  }

  if (cmd === "lock") {
    const sig = await program.methods
      .lock(new BN(argv.amount as string), new BN(argv.epochs as number))
      .accounts({
        config: configPda,
        stakePosition: positionPda,
        staker: payer.publicKey,
      })
      .rpc();
    const pos: any = await program.account.stakePosition.fetch(positionPda);
    console.log(JSON.stringify({ tx: sig, lockedAmount: pos.lockedAmount.toString(), lockEndEpoch: pos.lockEndEpoch.toString(), lockMultiplierBps: pos.lockMultiplierBps }, null, 2));
    return;
  }

  if (cmd === "unlock-expired") {
    const sig = await program.methods
      .unlockExpired()
      .accounts({ config: configPda, stakePosition: positionPda, staker: payer.publicKey })
      .rpc();
    const pos: any = await program.account.stakePosition.fetch(positionPda);
    console.log(JSON.stringify({ tx: sig, lockedAmount: pos.lockedAmount.toString(), lockEndEpoch: pos.lockEndEpoch.toString() }, null, 2));
    return;
  }

  if (cmd === "request-exit") {
    const sig = await program.methods
      .requestExit(new BN(argv.amount as string))
      .accounts({ config: configPda, stakePosition: positionPda, staker: payer.publicKey })
      .rpc();
    const pos: any = await program.account.stakePosition.fetch(positionPda);
    console.log(JSON.stringify({ tx: sig, pendingWithdraw: pos.pendingWithdrawAmount.toString(), exitRequestedEpoch: pos.exitRequestedEpoch.toString() }, null, 2));
    return;
  }

  if (cmd === "finalize-withdraw") {
    const cfg: any = await program.account.stakeGovConfig.fetch(configPda);
    const stakeMint = new PublicKey(cfg.stakeMint);
    const vault = new PublicKey(cfg.vault);
    const stakerAta = getAssociatedTokenAddressSync(stakeMint, payer.publicKey);
    const sig = await program.methods
      .finalizeWithdraw()
      .accounts({
        config: configPda,
        vaultAuthority,
        vault,
        stakePosition: positionPda,
        stakerAta,
        staker: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log(JSON.stringify({ tx: sig, stakerAta: stakerAta.toBase58(), vault: vault.toBase58() }, null, 2));
    return;
  }

  if (cmd === "delegate") {
    const toStr = argv.to as string;
    const to = toStr === "none" ? new PublicKey(new Uint8Array(32)) : new PublicKey(toStr);
    const sig = await program.methods
      .setDelegate(to)
      .accounts({
        config: configPda,
        verifierRegistry: registryPda,
        stakePosition: positionPda,
        staker: payer.publicKey,
      })
      .rpc();
    const pos: any = await program.account.stakePosition.fetch(positionPda);
    console.log(JSON.stringify({ tx: sig, delegatedTo: pos.delegatedTo.toBase58() }, null, 2));
    return;
  }

  if (cmd === "set-delegation-slashable") {
    const sig = await program.methods
      .setDelegationSlashable(argv.enabled as boolean)
      .accounts({ config: configPda, stakePosition: positionPda, staker: payer.publicKey })
      .rpc();
    const pos: any = await program.account.stakePosition.fetch(positionPda);
    console.log(JSON.stringify({ tx: sig, delegationSlashable: pos.delegationSlashable }, null, 2));
    return;
  }

  if (cmd === "status") {
    const cfgInfo = await program.account.stakeGovConfig.fetchNullable(configPda);
    const posInfo = await program.account.stakePosition.fetchNullable(positionPda);
    const slot = await connection.getSlot("confirmed");
    const epochLen = cfgInfo ? Number((cfgInfo as any).epochLenSlots) : 0;
    const epoch = cfgInfo ? Math.floor(slot / epochLen) : null;
    console.log(
      JSON.stringify(
        {
          programId: programId.toBase58(),
          configPda: configPda.toBase58(),
          registryPda: registryPda.toBase58(),
          positionPda: positionPda.toBase58(),
          slot,
          epochLenSlots: epochLen || null,
          currentEpoch: epoch,
          config: cfgInfo || null,
          position: posInfo || null,
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

function loadKeypair(filePath: string): anchor.web3.Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
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

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function hex32(s: string): Uint8Array {
  const hex = s.startsWith("0x") ? s.slice(2) : s;
  if (hex.length !== 64) throw new Error("expected 32-byte hex (64 chars)");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("epoch", { type: "number", demandOption: true })
    .option("offender", { type: "string", demandOption: true })
    .option("bps", { type: "number", demandOption: true })
    .option("reason", { type: "string", demandOption: true })
    .option("evidence", { type: "string", demandOption: true, describe: "hex32" })
    .option("rpc", { type: "string" })
    .option("wallet", { type: "string" })
    .option("program-id", { type: "string" })
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

  const offender = new PublicKey(argv.offender);
  const epoch = BigInt(argv.epoch);
  const reasonHash = sha256(Buffer.from(argv.reason, "utf8"));
  const evidenceRef = hex32(argv.evidence);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("stake_gov_config")], programId);
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("verifier_registry")], programId);
  const [offenderPositionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), offender.toBuffer()],
    programId
  );
  const [slashRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("slash"), u64le(epoch), offender.toBuffer(), reasonHash],
    programId
  );

  const sig = await program.methods
    .applySlash(
      new BN(argv.epoch),
      argv.bps as number,
      Array.from(reasonHash) as any,
      Array.from(evidenceRef) as any
    )
    .accounts({
      config: configPda,
      verifierRegistry: registryPda,
      offender,
      offenderPosition: offenderPositionPda,
      slashRecord: slashRecordPda,
      slasher: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(
    JSON.stringify(
      {
        tx: sig,
        configPda: configPda.toBase58(),
        registryPda: registryPda.toBase58(),
        offender: offender.toBase58(),
        offenderPositionPda: offenderPositionPda.toBase58(),
        slashRecordPda: slashRecordPda.toBase58(),
        reasonHash: Buffer.from(reasonHash).toString("hex"),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

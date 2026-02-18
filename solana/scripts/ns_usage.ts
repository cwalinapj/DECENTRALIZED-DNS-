import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import BN from "bn.js";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";

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

function domainHash(domainNorm: string): Uint8Array {
  return crypto.createHash("sha256").update(domainNorm, "utf8").digest();
}

function parseHex32(hex: string, label: string): number[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error(`${label} must be hex32`);
  return Array.from(Buffer.from(h, "hex"));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("domain", { type: "string", demandOption: true })
    .option("query-count", { type: "string", demandOption: true, describe: "u64 decimal" })
    .option("receipts-root", { type: "string", demandOption: true, describe: "hex32 merkle root of query receipts" })
    .option("rpc", { type: "string" })
    .option("wallet", { type: "string" })
    .option("program-id", { type: "string" })
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
  const cfg: any = await program.account.nsConfig.fetch(nsConfig);
  const epochLenSlots = BigInt(cfg.epochLenSlots.toString());

  const slot = BigInt(await connection.getSlot("confirmed"));
  const epochId = slot / epochLenSlots;

  const d = normalizeDomain(argv.domain!);
  const dh = domainHash(d);

  const [nsClaim] = PublicKey.findProgramAddressSync([Buffer.from("ns_claim"), Buffer.from(dh)], programId);
  const [epochUsage] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("ns_usage"),
      Buffer.from(dh),
      Buffer.from(new BN(epochId.toString()).toArrayLike(Buffer, "le", 8)),
    ],
    programId
  );

  console.log("rpc:", rpcUrl);
  console.log("program_id:", programId.toBase58());
  console.log("submitter_pubkey:", payer.publicKey.toBase58());
  console.log("domain_norm:", d);
  console.log("domain_hash:", Buffer.from(dh).toString("hex"));
  console.log("epoch_id:", epochId.toString());
  console.log("pda_ns_claim:", nsClaim.toBase58());
  console.log("pda_epoch_usage:", epochUsage.toBase58());

  const queryCount = BigInt(String(argv["query-count"]));
  const receiptsRoot = parseHex32(argv["receipts-root"]!, "receipts-root");

  const sig = await program.methods
    .submitUsageAggregate(
      Array.from(dh),
      new BN(epochId.toString()),
      new BN(queryCount.toString()),
      receiptsRoot,
      new BN(slot.toString())
    )
    .accounts({
      nsConfig,
      nsClaim,
      epochUsage,
      attestor: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("tx_submit_usage_aggregate:", sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

const DEFAULT_RPC =
  process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const DEFAULT_WALLET =
  process.env.WALLET || process.env.ANCHOR_WALLET || path.join(process.env.HOME || ".", ".config/solana/id.json");

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdl() {
  const p = path.resolve("target/idl/ddns_names.json");
  if (!fs.existsSync(p)) {
    throw new Error(`IDL not found at ${p}. Run: anchor build --program-name ddns_names`);
  }
  const idl = JSON.parse(fs.readFileSync(p, "utf8"));
  // Anchor TS can choke on account namespace for legacy/minimal IDLs. Methods still work without it.
  delete idl.accounts;
  return idl;
}

function readProgramIdFromAnchorToml(rpcUrl: string, program = "ddns_names"): string | null {
  try {
    const tomlPath = path.resolve("Anchor.toml");
    if (!fs.existsSync(tomlPath)) return null;
    const content = fs.readFileSync(tomlPath, "utf8");
    const isLocal = /127\.0\.0\.1|localhost/.test(rpcUrl);
    const section = isLocal ? "programs.localnet" : "programs.devnet";
    const re = new RegExp(`\\[${section}\\][^\\[]*?${program}\\s*=\\s*\"([^\"]+)\"`, "s");
    const m = content.match(re);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function normalizeFullName(name: string): string {
  return name.trim().toLowerCase().replace(/\.+$/, "");
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function sha256Bytes(data: Buffer | string): Buffer {
  return crypto.createHash("sha256").update(data).digest();
}

function hashName(name: string): Uint8Array {
  return Uint8Array.from(sha256Bytes(normalizeFullName(name)));
}

function hashLabel(label: string): Uint8Array {
  return Uint8Array.from(sha256Bytes(normalizeLabel(label)));
}

async function fetchTreasuryFromConfig(connection: Connection, configPda: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(configPda);
  if (!info || !info.data || info.data.length < 8 + 64) {
    throw new Error(`names config not found at ${configPda.toBase58()}`);
  }
  return new PublicKey(info.data.subarray(8 + 32, 8 + 64));
}

async function fetchPrimaryRaw(connection: Connection, primaryPda: PublicKey) {
  const info = await connection.getAccountInfo(primaryPda);
  if (!info) return null;
  if (info.data.length < 8 + 32 + 32 + 1 + 1 + 1) {
    throw new Error(`invalid PrimaryName account data length at ${primaryPda.toBase58()}`);
  }
  const owner = new PublicKey(info.data.subarray(8, 8 + 32));
  const nameHashHex = Buffer.from(info.data.subarray(8 + 32, 8 + 64)).toString("hex");
  const kind = info.data[8 + 64];
  const isSet = info.data[8 + 65] === 1;
  const bump = info.data[8 + 66];
  return { owner: owner.toBase58(), nameHashHex, kind, isSet, bump };
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("names")
    .option("rpc", { type: "string", default: DEFAULT_RPC })
    .option("wallet", { type: "string", default: DEFAULT_WALLET })
    .option("program-id", { type: "string", describe: "or use DDNS_NAMES_PROGRAM_ID / Anchor.toml" })
    .command(
      "init-config",
      "Initialize names config",
      (y) =>
        y
          .option("treasury", { type: "string", describe: "default wallet" })
          .option("parent-zone", { type: "string", default: "user.dns" })
          .option("premium-price-sol", { type: "number", default: 0.05 })
          .option("sub-bond-sol", { type: "number", default: 0 })
          .option("enable-subdomains", { type: "boolean", default: true })
          .option("enable-premium", { type: "boolean", default: true }),
      async (args) => {
        const { program, payer, connection, programId } = await loadProgram(args.rpc as string, args.wallet as string, args["program-id"] as string | undefined);
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("names_config")], programId);

        const treasury = new PublicKey((args.treasury as string | undefined) || payer.publicKey.toBase58());
        const premiumPriceLamports = BigInt(Math.round((args["premium-price-sol"] as number) * 1e9));
        const subBondLamports = BigInt(Math.round((args["sub-bond-sol"] as number) * 1e9));

        const sig = await program.methods
          .initNamesConfig(
            treasury,
            String(args["parent-zone"]),
            new BN(premiumPriceLamports.toString()),
            new BN(subBondLamports.toString()),
            args["enable-subdomains"] as boolean,
            args["enable-premium"] as boolean
          )
          .accounts({
            config: configPda,
            authority: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(JSON.stringify({
          tx: sig,
          programId: programId.toBase58(),
          configPda: configPda.toBase58(),
          treasury: treasury.toBase58(),
          parentZone: normalizeFullName(String(args["parent-zone"])),
          premiumPriceLamports: premiumPriceLamports.toString(),
          subBondLamports: subBondLamports.toString(),
        }, null, 2));
      }
    )
    .command(
      "claim-sub",
      "Claim subdomain under parent (default user.dns)",
      (y) => y.option("label", { type: "string", demandOption: true }).option("parent", { type: "string", default: "user.dns" }),
      async (args) => {
        const { program, payer, programId } = await loadProgram(args.rpc as string, args.wallet as string, args["program-id"] as string | undefined);
        const parent = normalizeFullName(String(args.parent));
        const label = normalizeLabel(String(args.label));
        const parentHash = hashName(parent);
        const labelHash = hashLabel(label);

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("names_config")], programId);
        const [subPda] = PublicKey.findProgramAddressSync([Buffer.from("sub"), Buffer.from(parentHash), Buffer.from(labelHash)], programId);
        const [primaryPda] = PublicKey.findProgramAddressSync([Buffer.from("primary"), payer.publicKey.toBuffer()], programId);
        const treasury = await fetchTreasuryFromConfig(connection, configPda);

        const sig = await program.methods
          .claimSubdomain(parent, label, Array.from(parentHash), Array.from(labelHash))
          .accounts({
            config: configPda,
            treasury,
            subName: subPda,
            primary: primaryPda,
            owner: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(JSON.stringify({ tx: sig, subPda: subPda.toBase58(), primaryPda: primaryPda.toBase58(), parent, label }, null, 2));
      }
    )
    .command(
      "buy-premium",
      "Purchase premium second-level .dns name",
      (y) => y.option("name", { type: "string", demandOption: true }),
      async (args) => {
        const { program, payer, connection, programId } = await loadProgram(args.rpc as string, args.wallet as string, args["program-id"] as string | undefined);
        const name = normalizeFullName(String(args.name));
        const nameHash = hashName(name);
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("names_config")], programId);
        const [premiumPda] = PublicKey.findProgramAddressSync([Buffer.from("premium"), Buffer.from(nameHash)], programId);
        const [policyPda] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), Buffer.from(nameHash)], programId);
        const [primaryPda] = PublicKey.findProgramAddressSync([Buffer.from("primary"), payer.publicKey.toBuffer()], programId);
        const treasury = await fetchTreasuryFromConfig(connection, configPda);

        const sig = await program.methods
          .purchasePremium(name, Array.from(nameHash))
          .accounts({
            config: configPda,
            treasury,
            premiumName: premiumPda,
            parentPolicy: policyPda,
            primary: primaryPda,
            owner: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(JSON.stringify({ tx: sig, premiumPda: premiumPda.toBase58(), policyPda: policyPda.toBase58(), primaryPda: primaryPda.toBase58(), name }, null, 2));
      }
    )
    .command(
      "set-primary",
      "Set primary name for wallet",
      (y) => y.option("name", { type: "string", demandOption: true }),
      async (args) => {
        const { program, payer, programId } = await loadProgram(args.rpc as string, args.wallet as string, args["program-id"] as string | undefined);
        const name = normalizeFullName(String(args.name));
        const nameHash = hashName(name);
        const [primaryPda] = PublicKey.findProgramAddressSync([Buffer.from("primary"), payer.publicKey.toBuffer()], programId);

        let kind = 1;
        let premiumName: PublicKey | null = null;
        let subName: PublicKey | null = null;
        if (name.endsWith(".user.dns")) {
          kind = 2;
          const parts = name.split(".");
          const label = parts[0];
          const parent = "user.dns";
          const parentHash = hashName(parent);
          const labelHash = hashLabel(label);
          [subName] = PublicKey.findProgramAddressSync([Buffer.from("sub"), Buffer.from(parentHash), Buffer.from(labelHash)], programId);
        } else {
          [premiumName] = PublicKey.findProgramAddressSync([Buffer.from("premium"), Buffer.from(nameHash)], programId);
        }

        const sig = await program.methods
          .setPrimaryName(Array.from(nameHash), kind)
          .accounts({
            primary: primaryPda,
            premiumName,
            subName,
            owner: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(JSON.stringify({ tx: sig, primaryPda: primaryPda.toBase58(), name, kind }, null, 2));
      }
    )
    .command(
      "resolve-primary",
      "Resolve wallet primary name hash",
      (y) => y.option("owner", { type: "string", demandOption: true }),
      async (args) => {
        const { connection, programId } = await loadProgram(args.rpc as string, args.wallet as string, args["program-id"] as string | undefined);
        const owner = new PublicKey(String(args.owner));
        const [primaryPda] = PublicKey.findProgramAddressSync([Buffer.from("primary"), owner.toBuffer()], programId);

        const acct = await fetchPrimaryRaw(connection, primaryPda);
        console.log(JSON.stringify({ owner: owner.toBase58(), primaryPda: primaryPda.toBase58(), primary: acct }, null, 2));
      }
    )
    .demandCommand(1)
    .strict()
    .parse();

  return argv;
}

async function loadProgram(rpc: string, walletPath: string, programIdArg?: string) {
  const payer = loadKeypair(walletPath);
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = loadIdl();
  const programIdStr =
    programIdArg ||
    process.env.DDNS_NAMES_PROGRAM_ID ||
    readProgramIdFromAnchorToml(rpc, "ddns_names");
  if (!programIdStr) {
    throw new Error("ddns_names program id not found; set --program-id or DDNS_NAMES_PROGRAM_ID");
  }
  const programId = new PublicKey(programIdStr);
  const program = new anchor.Program(idl as any, programId, provider);
  return { program, payer, provider, connection, programId };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

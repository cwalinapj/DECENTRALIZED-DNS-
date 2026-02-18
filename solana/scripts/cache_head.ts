import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

const DEFAULT_RPC = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const DEFAULT_WALLET = process.env.WALLET || process.env.ANCHOR_WALLET || path.join(process.env.HOME || ".", ".config/solana/id.json");

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdl() {
  const p = path.resolve("target/idl/ddns_cache_head.json");
  if (!fs.existsSync(p)) throw new Error(`IDL not found: ${p}. run anchor build --program-name ddns_cache_head`);
  const idl = JSON.parse(fs.readFileSync(p, "utf8"));
  delete idl.accounts;
  return idl;
}

function readProgramIdFromAnchorToml(rpcUrl: string, program = "ddns_cache_head"): string | null {
  const tomlPath = path.resolve("Anchor.toml");
  if (!fs.existsSync(tomlPath)) return null;
  const content = fs.readFileSync(tomlPath, "utf8");
  const isLocal = /127\.0\.0\.1|localhost/.test(rpcUrl);
  const section = isLocal ? "programs.localnet" : "programs.devnet";
  const re = new RegExp(`\\[${section}\\][^\\[]*?${program}\\s*=\\s*\"([^\"]+)\"`, "s");
  const m = content.match(re);
  return m ? m[1] : null;
}

function normalize(name: string) {
  return name.trim().toLowerCase().replace(/\.+$/, "");
}
function hash32(name: string): Uint8Array {
  return new Uint8Array(crypto.createHash("sha256").update(normalize(name)).digest());
}

function parseHead(data: Buffer) {
  if (data.length < 8 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1) return null;
  let o = 8;
  const parentNameHash = Buffer.from(data.subarray(o, o + 32)).toString("hex"); o += 32;
  const parentOwner = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
  const cacheRoot = Buffer.from(data.subarray(o, o + 32)).toString("hex"); o += 32;
  const cidHash = Buffer.from(data.subarray(o, o + 32)).toString("hex"); o += 32;
  const updatedAtSlot = Number(data.readBigUInt64LE(o)); o += 8;
  const epochId = Number(data.readBigUInt64LE(o)); o += 8;
  const enabled = data[o] === 1; o += 1;
  const bump = data[o];
  return { parentNameHash, parentOwner, cacheRoot, cidHash, updatedAtSlot, epochId, enabled, bump };
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("rpc", { type: "string", default: DEFAULT_RPC })
    .option("wallet", { type: "string", default: DEFAULT_WALLET })
    .option("program-id", { type: "string" })
    .command("init", "init cache head", (y) => y.option("parent", { type: "string", demandOption: true }).option("owner", { type: "string" }), async (args) => {
      const { program, payer, programId, connection } = await loadProgram(args.rpc as string, args.wallet as string, args["program-id"] as string | undefined);
      const parentHash = hash32(String(args.parent));
      const owner = new PublicKey((args.owner as string | undefined) || payer.publicKey.toBase58());
      const [cacheHead] = PublicKey.findProgramAddressSync([Buffer.from("cache_head"), Buffer.from(parentHash)], programId);
      const sig = await program.methods
        .initCacheHead(Array.from(parentHash), owner)
        .accounts({ cacheHead, payer: payer.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      const info = await connection.getAccountInfo(cacheHead);
      console.log(JSON.stringify({ tx: sig, programId: programId.toBase58(), cacheHead: cacheHead.toBase58(), parentHashHex: Buffer.from(parentHash).toString("hex"), head: info ? parseHead(info.data) : null }, null, 2));
    })
    .command("set", "set cache head", (y) => y.option("parent", { type: "string", demandOption: true }).option("cache-root", { type: "string", demandOption: true }).option("cid", { type: "string", demandOption: true }).option("epoch", { type: "number", demandOption: true }), async (args) => {
      const { program, payer, programId, connection } = await loadProgram(args.rpc as string, args.wallet as string, args["program-id"] as string | undefined);
      const parentHash = hash32(String(args.parent));
      const cacheRoot = Buffer.from(String(args["cache-root"]).replace(/^0x/, "").padStart(64, "0"), "hex");
      const cidHash = crypto.createHash("sha256").update(String(args.cid), "utf8").digest();
      const [cacheHead] = PublicKey.findProgramAddressSync([Buffer.from("cache_head"), Buffer.from(parentHash)], programId);
      const sig = await program.methods
        .setCacheHead(Array.from(parentHash), Array.from(cacheRoot), Array.from(cidHash), new BN(String(args.epoch)))
        .accounts({ cacheHead, parentOwner: payer.publicKey })
        .rpc();
      const info = await connection.getAccountInfo(cacheHead);
      console.log(JSON.stringify({ tx: sig, cacheHead: cacheHead.toBase58(), epoch: Number(args.epoch), cidHashHex: cidHash.toString("hex"), head: info ? parseHead(info.data) : null }, null, 2));
    })
    .command("show", "show cache head", (y) => y.option("parent", { type: "string", demandOption: true }), async (args) => {
      const { programId, connection } = await loadProgram(args.rpc as string, args.wallet as string, args["program-id"] as string | undefined);
      const parentHash = hash32(String(args.parent));
      const [cacheHead] = PublicKey.findProgramAddressSync([Buffer.from("cache_head"), Buffer.from(parentHash)], programId);
      const info = await connection.getAccountInfo(cacheHead);
      console.log(JSON.stringify({ cacheHead: cacheHead.toBase58(), parentHashHex: Buffer.from(parentHash).toString("hex"), head: info ? parseHead(info.data) : null }, null, 2));
    })
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
  const programIdStr = programIdArg || process.env.DDNS_CACHE_HEAD_PROGRAM_ID || readProgramIdFromAnchorToml(rpc, "ddns_cache_head");
  if (!programIdStr) throw new Error("missing ddns_cache_head program id");
  const programId = new PublicKey(programIdStr);
  const program = new anchor.Program(idl as any, programId, provider);
  return { program, payer, provider, connection, programId };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

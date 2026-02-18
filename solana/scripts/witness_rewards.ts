import fs from "node:fs";
import path from "node:path";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const DEFAULT_RPC = process.env.ANCHOR_PROVIDER_URL || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = process.env.DDNS_WITNESS_REWARDS_PROGRAM_ID || "HTd88EzMhvsWjNwMnrt6mquChgogjmdQTbSmDzwps975";

function u64Le(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value);
  return b;
}

function loadIdl(): Idl {
  const p = path.resolve("target/idl/ddns_witness_rewards.json");
  if (!fs.existsSync(p)) {
    throw new Error(`missing_idl:${p}. Run: anchor build --program-name ddns_witness_rewards`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8")) as Idl;
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

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("witness-rewards")
    .command(
      "status",
      "Show ddns_witness_rewards PDAs and decoded accounts",
      (cmd) =>
        cmd
          .option("rpc", { type: "string", default: DEFAULT_RPC })
          .option("program-id", { type: "string", default: DEFAULT_PROGRAM_ID })
          .option("miner", { type: "string", demandOption: true })
          .option("epoch", { type: "number" }),
      async (args) => {
        const rpc = String(args.rpc);
        const miner = new PublicKey(String(args.miner));
        const programId = new PublicKey(String(args["program-id"]));
        const connection = new Connection(rpc, "confirmed");

        const configPda = PublicKey.findProgramAddressSync([Buffer.from("witness_rewards_config")], programId)[0];
        const vaultAuthPda = PublicKey.findProgramAddressSync([Buffer.from("witness_rewards_vault_authority")], programId)[0];
        const bondPda = PublicKey.findProgramAddressSync([Buffer.from("bond"), miner.toBuffer()], programId)[0];

        const idl = loadIdl();
        const coder = new BorshAccountsCoder(idl);

        const cfg = await fetchDecoded(connection, coder, configPda, "WitnessRewardsConfig");
        const bond = await fetchDecoded(connection, coder, bondPda, "MinerBond");

        let epoch = typeof args.epoch === "number" ? BigInt(args.epoch) : null;
        if (epoch === null && cfg) {
          const slot = await connection.getSlot("confirmed");
          const epochLen = BigInt(cfg.epochLenSlots.toString());
          if (epochLen > 0n) epoch = BigInt(slot) / epochLen;
        }

        let epochStatePda: PublicKey | null = null;
        let epochStatsPda: PublicKey | null = null;
        let epochState: any = null;
        let epochStats: any = null;

        if (epoch !== null) {
          const epochSeed = u64Le(epoch);
          epochStatePda = PublicKey.findProgramAddressSync([Buffer.from("epoch_state"), epochSeed], programId)[0];
          epochStatsPda = PublicKey.findProgramAddressSync([Buffer.from("epoch_stats"), epochSeed, miner.toBuffer()], programId)[0];
          epochState = await fetchDecoded(connection, coder, epochStatePda, "EpochState");
          epochStats = await fetchDecoded(connection, coder, epochStatsPda, "EpochMinerStats");
        }

        console.log(JSON.stringify({
          rpc,
          programId: programId.toBase58(),
          miner: miner.toBase58(),
          pda: {
            config: configPda.toBase58(),
            vaultAuthority: vaultAuthPda.toBase58(),
            bond: bondPda.toBase58(),
            ...(epochStatePda ? { epochState: epochStatePda.toBase58() } : {}),
            ...(epochStatsPda ? { epochStats: epochStatsPda.toBase58() } : {})
          },
          epoch: epoch !== null ? epoch.toString() : null,
          accounts: {
            config: cfg,
            bond,
            epochState,
            epochStats
          }
        }, null, 2));
      }
    )
    .demandCommand(1)
    .strict()
    .help()
    .parseAsync();

  return argv;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

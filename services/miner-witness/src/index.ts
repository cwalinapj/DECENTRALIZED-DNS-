import fs from "node:fs";
import path from "node:path";
import express from "express";
import { z } from "zod";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const Env = z.object({
  RPC_URL: z.string().default("https://api.devnet.solana.com"),
  MINER_WALLET: z.string().optional(),
  DDNS_MINER_SCORE_PROGRAM_ID: z.string().optional(),
  PORT: z.string().default("8787"),
});

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdl(idlPath: string) {
  if (!fs.existsSync(idlPath)) {
    throw new Error(`IDL not found at ${idlPath}. Run 'anchor build' in /solana first.`);
  }
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

const ReportSchema = z.object({
  epoch_id: z.number().int().nonnegative(),
  miner: z.string(),
  stake_weight: z.string(),
  aggregates_submitted: z.number().int().nonnegative(),
  unique_name_count: z.number().int().nonnegative(),
  unique_receipt_count: z.number().int().nonnegative(),
  first_submit_slot: z.number().int().nonnegative(),
  last_submit_slot: z.number().int().nonnegative(),
  uptime_score: z.number().int().min(0).max(10000).default(10000),
  correctness_score: z.number().int().min(0).max(10000).default(10000),
  dominance_share_bps: z.number().int().min(0).max(10000).default(0),
});

async function main() {
  const env = Env.parse({
    RPC_URL: process.env.SOLANA_RPC_URL || process.env.RPC_URL,
    MINER_WALLET: process.env.MINER_WALLET,
    DDNS_MINER_SCORE_PROGRAM_ID: process.env.DDNS_MINER_SCORE_PROGRAM_ID,
    PORT: process.env.PORT,
  });

  const walletPath =
    env.MINER_WALLET ||
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || ".", ".config/solana/id.json");

  const rpcUrl = env.RPC_URL;

  const keypair = loadKeypair(walletPath);
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = loadIdl(
    path.resolve(process.cwd(), "..", "..", "solana", "target", "idl", "ddns_miner_score.json")
  );

  const programIdStr =
    env.DDNS_MINER_SCORE_PROGRAM_ID ||
    process.env.DDNS_MINER_SCORE_PROGRAM_ID ||
    (idl?.metadata?.address as string | undefined);
  if (!programIdStr) {
    throw new Error(
      "DDNS_MINER_SCORE_PROGRAM_ID not set and not found in IDL metadata"
    );
  }
  const programId = new PublicKey(programIdStr);
  const program = new anchor.Program(idl as any, programId, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("miner_score_config")],
    programId
  );

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/v1/health", (_req, res) => res.json({ ok: true }));

  // MVP: this service just submits stats (it does not prove them on-chain).
  // End-state: stats will be accompanied by Merkle proofs and/or challenged.
  app.post("/v1/report-epoch-stats", async (req, res) => {
    try {
      const body = ReportSchema.parse(req.body);
      const miner = new PublicKey(body.miner);
      const epochId = BigInt(body.epoch_id);
      const [minerEpochPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("miner_epoch"), u64le(epochId), miner.toBuffer()],
        programId
      );

      const sig = await program.methods
        .reportMinerEpochStats(
          new BN(body.epoch_id),
          miner,
          new BN(body.stake_weight),
          body.aggregates_submitted,
          body.unique_name_count,
          body.unique_receipt_count,
          new BN(body.first_submit_slot),
          new BN(body.last_submit_slot),
          body.uptime_score,
          body.correctness_score,
          body.dominance_share_bps
        )
        .accounts({
          config: configPda,
          minerEpoch: minerEpochPda,
          submitter: keypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      res.json({
        ok: true,
        tx: sig,
        config_pda: configPda.toBase58(),
        miner_epoch_pda: minerEpochPda.toBase58(),
      });
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.listen(Number(env.PORT), () => {
    // Keep logs minimal; do not log client IPs in MVP.
    console.log(
      JSON.stringify({
        service: "miner-witness",
        port: Number(env.PORT),
        rpc_url: rpcUrl,
        wallet_pubkey: keypair.publicKey.toBase58(),
        miner_score_program_id: programId.toBase58(),
      })
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


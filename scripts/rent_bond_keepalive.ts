import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type RentBondReport = {
  timestamp_utc: string;
  rpc: string;
  wallet_pubkey: string;
  reserve_pda: string;
  reserve_shortfall_lamports: number;
  reserve_shortfall_sol: string;
  reserve_target_lamports: number;
  reserve_lamports: number;
};

const ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(ROOT, "artifacts/rent_bond_report.json");
const ALLOW_AUTO_TRANSFER = process.env.ALLOW_AUTO_TRANSFER === "1";
const AUTO_TRANSFER_CAP_SOL = Number(process.env.AUTO_TRANSFER_CAP_SOL || "1");
const LAMPORTS_PER_SOL = 1_000_000_000;
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.WALLET || process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function toSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(9);
}

function main(): void {
  if (!existsSync(REPORT_PATH)) {
    process.stderr.write(
      `missing_report: ${REPORT_PATH}\nrun 'npm run rent:bond:audit' first\n`,
    );
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as RentBondReport;

  process.stdout.write(
    [
      "## Rent Bond Keepalive",
      `- timestamp_utc: ${new Date().toISOString()}`,
      `- rpc: ${RPC_URL}`,
      `- reserve_pda: ${report.reserve_pda}`,
      `- reserve_target_lamports: ${report.reserve_target_lamports}`,
      `- reserve_lamports: ${report.reserve_lamports}`,
      `- reserve_shortfall_lamports: ${report.reserve_shortfall_lamports}`,
      `- reserve_shortfall_sol: ${report.reserve_shortfall_sol}`,
    ].join("\n") + "\n",
  );

  if (report.reserve_shortfall_lamports <= 0) {
    process.stdout.write("status: reserve funded\n");
    process.exit(0);
  }

  process.stdout.write("status: needs top-up\n");
  if (!ALLOW_AUTO_TRANSFER) {
    process.stdout.write("auto_transfer: disabled (set ALLOW_AUTO_TRANSFER=1 to enable)\n");
    process.exit(0);
  }

  const capLamports = Math.max(0, Math.floor(AUTO_TRANSFER_CAP_SOL * LAMPORTS_PER_SOL));
  const transferLamports = Math.min(report.reserve_shortfall_lamports, capLamports);
  if (transferLamports <= 0) {
    process.stdout.write("auto_transfer: skipped (cap is zero)\n");
    process.exit(0);
  }

  process.stdout.write(
    `auto_transfer: sending ${transferLamports} lamports (${toSol(transferLamports)} SOL)\n`,
  );
  const out = run("solana", [
    "transfer",
    report.reserve_pda,
    String(transferLamports),
    "--lamports",
    "--allow-unfunded-recipient",
    "--url",
    RPC_URL,
    "--keypair",
    WALLET_PATH,
    "--no-wait",
  ]);
  process.stdout.write(`${out}\n`);
}

main();

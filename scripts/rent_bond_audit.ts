import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type InventoryProgram = {
  name: string;
  tier: "REQUIRED" | "OPTIONAL";
  program_id: string;
  exists: boolean;
  executable: boolean;
  lamports: number;
  status: string;
};

type InventoryJson = {
  timestamp_utc: string;
  rpc: string;
  wallet?: { pubkey?: string; lamports?: number; sol?: string };
  programs: InventoryProgram[];
  summary?: {
    required_fail?: number;
    optional_fail?: number;
    missing_required?: string[];
    nonexec_required?: string[];
    missing_optional?: string[];
    nonexec_optional?: string[];
  };
};

type RentBondReport = {
  timestamp_utc: string;
  rpc: string;
  wallet_pubkey: string;
  wallet_lamports: number;
  wallet_sol: string;
  ddns_rent_bond_program_id: string;
  reserve_pda: string;
  reserve_lamports: number;
  total_program_lamports: number;
  largest_program_lamports: number;
  optional_extra_lamports: number;
  reserve_target_lamports: number;
  reserve_target_sol: string;
  reserve_shortfall_lamports: number;
  reserve_shortfall_sol: string;
  missing_required_count: number;
  missing_optional_count: number;
  missing_required: string[];
  missing_optional: string[];
  inventory_path: string;
  inventory_timestamp_utc: string;
};

const ROOT = resolve(__dirname, "..");
const ARTIFACTS_DIR = resolve(ROOT, "artifacts");
const INVENTORY_PATH = resolve(
  ROOT,
  process.env.INVENTORY_PATH || "artifacts/devnet_inventory.json",
);
const REPORT_JSON_PATH = resolve(ARTIFACTS_DIR, "rent_bond_report.json");
const REPORT_MD_PATH = resolve(ARTIFACTS_DIR, "rent_bond_report.md");
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.WALLET || process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
const OPTIONAL_EXTRA_LAMPORTS = Number(process.env.OPTIONAL_EXTRA_LAMPORTS || "0");
const MIN_RESERVE_LAMPORTS = 5_000_000_000;
const BUFFER_LAMPORTS = 1_000_000_000;
const LAMPORTS_PER_SOL = 1_000_000_000;

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function toSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(9);
}

function parseAnchorProgramId(name: string): string {
  const anchorToml = readFileSync(resolve(ROOT, "solana/Anchor.toml"), "utf8");
  let inDevnet = false;
  for (const line of anchorToml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "[programs.devnet]") {
      inDevnet = true;
      continue;
    }
    if (trimmed.startsWith("[") && inDevnet) break;
    if (!inDevnet) continue;
    const m = trimmed.match(/^([a-zA-Z0-9_]+)\s*=\s*"([^"]+)"$/);
    if (m && m[1] === name) return m[2];
  }
  throw new Error(`program '${name}' not found in [programs.devnet]`);
}

function deriveReservePda(programId: string): string {
  try {
    const out = run("solana", [
      "find-program-derived-address",
      "-u",
      RPC_URL,
      "--output",
      "json-compact",
      programId,
      "string:program_reserve",
    ]);
    const parsed = JSON.parse(out) as { address?: string };
    if (!parsed.address) throw new Error("missing address");
    return parsed.address;
  } catch {
    return "-";
  }
}

function readLamports(address: string): number {
  if (!address || address === "-") return 0;
  try {
    const out = run("solana", ["account", "-u", RPC_URL, address, "--output", "json"]);
    const parsed = JSON.parse(out) as { account?: { lamports?: number }; lamports?: number };
    return Number(parsed.account?.lamports ?? parsed.lamports ?? 0);
  } catch {
    return 0;
  }
}

function computeReserveTarget(
  largestProgramLamports: number,
  optionalExtraLamports: number,
): number {
  return Math.max(
    MIN_RESERVE_LAMPORTS,
    largestProgramLamports * 2 + BUFFER_LAMPORTS + optionalExtraLamports,
  );
}

function buildMarkdown(report: RentBondReport): string {
  return [
    "# Rent Reserve Bond Report",
    "",
    `- timestamp_utc: ${report.timestamp_utc}`,
    `- rpc: ${report.rpc}`,
    `- wallet_pubkey: ${report.wallet_pubkey}`,
    `- wallet_sol: ${report.wallet_sol}`,
    `- ddns_rent_bond_program_id: ${report.ddns_rent_bond_program_id}`,
    `- reserve_pda: ${report.reserve_pda}`,
    "",
    "## Summary",
    "",
    `- total_program_lamports: ${report.total_program_lamports}`,
    `- largest_program_lamports: ${report.largest_program_lamports}`,
    `- optional_extra_lamports: ${report.optional_extra_lamports}`,
    `- reserve_target_lamports: ${report.reserve_target_lamports}`,
    `- reserve_target_sol: ${report.reserve_target_sol}`,
    `- reserve_lamports: ${report.reserve_lamports}`,
    `- reserve_shortfall_lamports: ${report.reserve_shortfall_lamports}`,
    `- reserve_shortfall_sol: ${report.reserve_shortfall_sol}`,
    `- missing_required_count: ${report.missing_required_count}`,
    `- missing_optional_count: ${report.missing_optional_count}`,
    "",
    "## Missing Programs",
    "",
    `- required: ${report.missing_required.length ? report.missing_required.join(", ") : "(none)"}`,
    `- optional: ${report.missing_optional.length ? report.missing_optional.join(", ") : "(none)"}`,
    "",
    "## Notes",
    "",
    "- This report is accounting/planning only. It does not claim rent can be removed.",
    "- Solana rent exemption still requires lamports in each account.",
    "",
  ].join("\n");
}

function main(): void {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const inventoryRaw = readFileSync(INVENTORY_PATH, "utf8");
  const inventory = JSON.parse(inventoryRaw) as InventoryJson;

  const walletPubkey = inventory.wallet?.pubkey || run("solana-keygen", ["pubkey", WALLET_PATH]);
  const walletLamports =
    Number(inventory.wallet?.lamports ?? readLamports(walletPubkey));
  const programs = inventory.programs || [];
  const totalProgramLamports = programs.reduce((acc, p) => acc + Number(p.lamports || 0), 0);
  const largestProgramLamports = programs.reduce(
    (acc, p) => Math.max(acc, Number(p.lamports || 0)),
    0,
  );
  const missingRequired = programs
    .filter((p) => p.tier === "REQUIRED" && (!p.exists || !p.executable))
    .map((p) => p.name);
  const missingOptional = programs
    .filter((p) => p.tier === "OPTIONAL" && (!p.exists || !p.executable))
    .map((p) => p.name);

  const programId = parseAnchorProgramId("ddns_rent_bond");
  const reservePda = deriveReservePda(programId);
  const reserveLamports = readLamports(reservePda);
  const reserveTargetLamports = computeReserveTarget(
    largestProgramLamports,
    OPTIONAL_EXTRA_LAMPORTS,
  );
  const reserveShortfallLamports = Math.max(0, reserveTargetLamports - reserveLamports);

  const report: RentBondReport = {
    timestamp_utc: new Date().toISOString(),
    rpc: RPC_URL,
    wallet_pubkey: walletPubkey,
    wallet_lamports: walletLamports,
    wallet_sol: toSol(walletLamports),
    ddns_rent_bond_program_id: programId,
    reserve_pda: reservePda,
    reserve_lamports: reserveLamports,
    total_program_lamports: totalProgramLamports,
    largest_program_lamports: largestProgramLamports,
    optional_extra_lamports: OPTIONAL_EXTRA_LAMPORTS,
    reserve_target_lamports: reserveTargetLamports,
    reserve_target_sol: toSol(reserveTargetLamports),
    reserve_shortfall_lamports: reserveShortfallLamports,
    reserve_shortfall_sol: toSol(reserveShortfallLamports),
    missing_required_count: missingRequired.length,
    missing_optional_count: missingOptional.length,
    missing_required: missingRequired,
    missing_optional: missingOptional,
    inventory_path: INVENTORY_PATH,
    inventory_timestamp_utc: inventory.timestamp_utc,
  };

  writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  const md = buildMarkdown(report);
  writeFileSync(REPORT_MD_PATH, md);
  process.stdout.write(`${md}\n`);
}

main();

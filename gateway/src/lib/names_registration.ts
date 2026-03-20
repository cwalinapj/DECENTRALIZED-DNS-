import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const execFileAsync = promisify(execFile);

export type NamesRegistrationMode = "premium" | "subdomain";

export type NamesRuntimeConfig = {
  repoRoot: string;
  rpcUrl: string;
  walletPath: string;
  namesProgramId: string;
  writeEnabled: boolean;
  idlPresent: boolean;
  walletPubkey: string | null;
};

export type NamesRegistrationPlan = {
  ok: boolean;
  name: string;
  mode: NamesRegistrationMode;
  label: string;
  parent?: string;
  nft_mode: "wallet" | "program_custody";
  command_preview: string[];
  command_args: string[][];
};

export type NamesAvailability = {
  ok: boolean;
  name: string;
  mode: NamesRegistrationMode;
  label: string;
  parent?: string;
  available: boolean;
  reason: string;
  rpc_url: string;
  names_program_id: string;
  names_program_deployed: boolean;
  names_config_initialized: boolean;
  idl_present: boolean;
  write_enabled: boolean;
  wallet_pubkey: string | null;
  nft_mode: "wallet" | "program_custody";
  pdas: Record<string, string>;
  command_preview: string[];
};

export type NamesRegisterRequest = {
  name: string;
  setPrimary?: boolean;
  execute?: boolean;
};

export type NamesRegisterResult = {
  ok: boolean;
  executed: boolean;
  name: string;
  mode: NamesRegistrationMode;
  command_preview: string[];
  steps: Array<{
    command: string;
    ok: boolean;
    stdout?: unknown;
    stderr?: string;
  }>;
};

function readAnchorProgramId(repoRoot: string, program: string, rpcUrl: string): string {
  const candidatePaths = [
    path.join(repoRoot, "solana", "Anchor.toml"),
    path.join(repoRoot, "Anchor.toml")
  ];
  const section = /127\.0\.0\.1|localhost/.test(rpcUrl) ? "[programs.localnet]" : "[programs.devnet]";
  for (const candidatePath of candidatePaths) {
    try {
      if (!fs.existsSync(candidatePath)) continue;
      const lines = fs.readFileSync(candidatePath, "utf8").split(/\r?\n/);
      let inSection = false;
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith("[")) {
          inSection = line === section;
          continue;
        }
        if (!inSection) continue;
        const match = line.match(new RegExp(`^${program}\\s*=\\s*"([^"]+)"$`));
        if (match?.[1]) return match[1];
      }
    } catch {}
  }
  return "";
}

function loadWalletPubkey(walletPath: string): string | null {
  try {
    if (!fs.existsSync(walletPath)) return null;
    const raw = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    return kp.publicKey.toBase58();
  } catch {
    return null;
  }
}

function normalizeDnsName(input: string): string {
  return input.trim().toLowerCase().replace(/\.+$/, "");
}

function isValidLabel(label: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(label);
}

function splitDnsName(name: string): { mode: NamesRegistrationMode; label: string; parent?: string } {
  const normalized = normalizeDnsName(name);
  const parts = normalized.split(".");
  if (parts.length < 2 || parts.at(-1) !== "dns") {
    throw new Error("name must end with .dns");
  }
  if (parts.length === 2) {
    const label = parts[0];
    if (!isValidLabel(label)) throw new Error("invalid premium label");
    return { mode: "premium", label };
  }
  const [label, ...rest] = parts;
  const parent = rest.join(".");
  if (!isValidLabel(label)) throw new Error("invalid subdomain label");
  return { mode: "subdomain", label, parent };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function derivePdas(programId: PublicKey, name: string, walletPubkey?: string | null) {
  const normalized = normalizeDnsName(name);
  const parsed = splitDnsName(normalized);
  const pdas: Record<string, string> = {};
  const nameHash = Buffer.from(awaitableSha256(normalized));
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("names_config")], programId);
  pdas.config = configPda.toBase58();
  if (parsed.mode === "premium") {
    const [premiumPda] = PublicKey.findProgramAddressSync([Buffer.from("premium"), nameHash], programId);
    const [policyPda] = PublicKey.findProgramAddressSync([Buffer.from("parent_policy"), nameHash], programId);
    const [premiumMintPda] = PublicKey.findProgramAddressSync([Buffer.from("premium_nft_mint"), nameHash], programId);
    pdas.premium_name = premiumPda.toBase58();
    pdas.parent_policy = policyPda.toBase58();
    pdas.nft_mint = premiumMintPda.toBase58();
  } else {
    const parentHash = Buffer.from(awaitableSha256(parsed.parent || ""));
    const labelHash = Buffer.from(awaitableSha256(parsed.label));
    const [subPda] = PublicKey.findProgramAddressSync([Buffer.from("sub"), parentHash, labelHash], programId);
    const [subMintPda] = PublicKey.findProgramAddressSync([Buffer.from("sub_nft_mint"), parentHash, labelHash], programId);
    const [custodyAuthorityPda] = PublicKey.findProgramAddressSync([Buffer.from("nft_custody_authority")], programId);
    pdas.sub_name = subPda.toBase58();
    pdas.nft_mint = subMintPda.toBase58();
    pdas.nft_custody_authority = custodyAuthorityPda.toBase58();
  }
  if (walletPubkey) {
    const owner = new PublicKey(walletPubkey);
    const [primaryPda] = PublicKey.findProgramAddressSync([Buffer.from("primary"), owner.toBuffer()], programId);
    pdas.primary = primaryPda.toBase58();
  }
  return pdas;
}

function awaitableSha256(input: string): Uint8Array {
  return crypto.createHash("sha256").update(Buffer.from(input, "utf8")).digest();
}

export function readNamesRuntimeConfig(repoRoot: string, env: NodeJS.ProcessEnv): NamesRuntimeConfig {
  const rpcUrl = env.SOLANA_RPC_URL || env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const walletPath =
    env.DDNS_NAMES_WALLET ||
    env.WALLET ||
    env.ANCHOR_WALLET ||
    path.join(env.HOME || ".", ".config", "solana", "id.json");
  const namesProgramId =
    env.DDNS_NAMES_PROGRAM_ID || readAnchorProgramId(repoRoot, "ddns_names", rpcUrl);
  const idlPresent = fs.existsSync(path.join(repoRoot, "solana", "target", "idl", "ddns_names.json"));
  const walletPubkey = loadWalletPubkey(walletPath);
  return {
    repoRoot,
    rpcUrl,
    walletPath,
    namesProgramId,
    writeEnabled: env.DDNS_NAMES_WRITE_ENABLED === "1",
    idlPresent,
    walletPubkey
  };
}

export function buildRegistrationPlan(config: NamesRuntimeConfig, input: NamesRegisterRequest): NamesRegistrationPlan {
  const name = normalizeDnsName(input.name);
  const parsed = splitDnsName(name);
  const sharedArgs = [
    "--rpc",
    config.rpcUrl,
    "--wallet",
    config.walletPath,
    ...(config.namesProgramId ? ["--program-id", config.namesProgramId] : [])
  ];
  const commandArgs: string[][] = [];
  if (parsed.mode === "premium") {
    commandArgs.push(["buy-premium", "--name", name, ...sharedArgs]);
    commandArgs.push(["issue-premium-nft", "--name", name, ...sharedArgs]);
  } else {
    commandArgs.push([
      "claim-sub",
      "--label",
      parsed.label,
      "--parent",
      parsed.parent || "user.dns",
      ...sharedArgs
    ]);
    commandArgs.push([
      "issue-sub-nft",
      "--label",
      parsed.label,
      "--parent",
      parsed.parent || "user.dns",
      ...sharedArgs
    ]);
  }
  if (input.setPrimary !== false) {
    commandArgs.push(["set-primary", "--name", name, ...sharedArgs]);
  }
  return {
    ok: true,
    name,
    mode: parsed.mode,
    label: parsed.label,
    ...(parsed.parent ? { parent: parsed.parent } : {}),
    nft_mode: parsed.mode === "premium" ? "wallet" : "program_custody",
    command_args: commandArgs,
    command_preview: commandArgs.map((args) => `npm -C solana run names -- ${args.map(shellQuote).join(" ")}`)
  };
}

export async function getNamesAvailability(
  config: NamesRuntimeConfig,
  rawName: string
): Promise<NamesAvailability> {
  const name = normalizeDnsName(rawName);
  const parsed = splitDnsName(name);
  if (!config.namesProgramId) {
    return {
      ok: false,
      name,
      mode: parsed.mode,
      label: parsed.label,
      ...(parsed.parent ? { parent: parsed.parent } : {}),
      available: false,
      reason: "ddns_names_program_id_missing",
      rpc_url: config.rpcUrl,
      names_program_id: "",
      names_program_deployed: false,
      names_config_initialized: false,
      idl_present: config.idlPresent,
      write_enabled: config.writeEnabled,
      wallet_pubkey: config.walletPubkey,
      nft_mode: parsed.mode === "premium" ? "wallet" : "program_custody",
      pdas: {},
      command_preview: buildRegistrationPlan(config, { name }).command_preview
    };
  }

  const programId = new PublicKey(config.namesProgramId);
  const pdas = derivePdas(programId, name, config.walletPubkey);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const programAccount = await connection.getAccountInfo(programId);
  const configAccount = await connection.getAccountInfo(new PublicKey(pdas.config));
  const registrationPda =
    parsed.mode === "premium"
      ? new PublicKey(pdas.premium_name)
      : new PublicKey(pdas.sub_name);
  const registrationAccount = await connection.getAccountInfo(registrationPda);

  const available = Boolean(programAccount?.executable) && Boolean(configAccount) && !registrationAccount;
  let reason = "available";
  if (!programAccount?.executable) reason = "ddns_names_program_not_deployed";
  else if (!configAccount) reason = "names_config_not_initialized";
  else if (registrationAccount) reason = parsed.mode === "premium" ? "premium_name_taken" : "subdomain_already_claimed";

  return {
    ok: true,
    name,
    mode: parsed.mode,
    label: parsed.label,
    ...(parsed.parent ? { parent: parsed.parent } : {}),
    available,
    reason,
    rpc_url: config.rpcUrl,
    names_program_id: config.namesProgramId,
    names_program_deployed: Boolean(programAccount?.executable),
    names_config_initialized: Boolean(configAccount),
    idl_present: config.idlPresent,
    write_enabled: config.writeEnabled,
    wallet_pubkey: config.walletPubkey,
    nft_mode: parsed.mode === "premium" ? "wallet" : "program_custody",
    pdas,
    command_preview: buildRegistrationPlan(config, { name }).command_preview
  };
}

function parseCommandJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const start = trimmed.lastIndexOf("{");
  if (start >= 0) {
    try {
      return JSON.parse(trimmed.slice(start));
    } catch {}
  }
  return trimmed;
}

export async function executeRegistrationPlan(
  config: NamesRuntimeConfig,
  input: NamesRegisterRequest
): Promise<NamesRegisterResult> {
  const plan = buildRegistrationPlan(config, input);
  const steps: NamesRegisterResult["steps"] = [];
  for (let i = 0; i < plan.command_args.length; i += 1) {
    const args = plan.command_args[i];
    try {
      const result = await execFileAsync(
        "npm",
        ["--silent", "-C", "solana", "run", "names", "--", ...args],
        {
          cwd: config.repoRoot,
          env: process.env,
          maxBuffer: 1024 * 1024 * 4
        }
      );
      steps.push({
        command: plan.command_preview[i],
        ok: true,
        stdout: parseCommandJson(result.stdout),
        stderr: result.stderr?.trim() || undefined
      });
    } catch (err: any) {
      steps.push({
        command: plan.command_preview[i],
        ok: false,
        stderr: String(err?.stderr || err?.message || err)
      });
      return {
        ok: false,
        executed: true,
        name: plan.name,
        mode: plan.mode,
        command_preview: plan.command_preview,
        steps
      };
    }
  }
  return {
    ok: true,
    executed: true,
    name: plan.name,
    mode: plan.mode,
    command_preview: plan.command_preview,
    steps
  };
}

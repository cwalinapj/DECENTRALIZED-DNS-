#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

type ProgramMap = Record<string, string>;

type ProgramAudit = {
  name: string;
  programId: string;
  executable: boolean;
  owner: string;
  lamports: number;
  sol: string;
  dataLength: number;
  upgradeAuthority: string;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function readProgramsFromAnchorToml(anchorTomlPath: string): ProgramMap {
  const content = fs.readFileSync(anchorTomlPath, 'utf8');
  const match = content.match(/\[programs\.devnet\]([\s\S]*?)(\n\[[^\]]+\]|$)/);
  if (!match) {
    throw new Error('Could not find [programs.devnet] section in Anchor.toml');
  }
  const block = match[1];
  const out: ProgramMap = {};
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z0-9_\-]+)\s*=\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"\s*$/);
    if (!kv) continue;
    out[kv[1]] = kv[2];
  }
  return out;
}

async function parseUpgradeAuthority(connection: Connection, programPk: PublicKey): Promise<string> {
  const programInfo = await rpcWithRetry(() => connection.getAccountInfo(programPk, 'confirmed'));
  if (!programInfo || !programInfo.data || programInfo.data.length < 36) {
    return 'unknown';
  }

  const tag = programInfo.data.readUInt32LE(0);
  if (tag !== 2) {
    return 'none';
  }

  const programDataPk = new PublicKey(programInfo.data.slice(4, 36));
  const programDataInfo = await rpcWithRetry(() => connection.getAccountInfo(programDataPk, 'confirmed'));
  if (!programDataInfo || !programDataInfo.data || programDataInfo.data.length < 13) {
    return 'unknown';
  }

  const pdTag = programDataInfo.data.readUInt32LE(0);
  if (pdTag !== 3) {
    return 'unknown';
  }

  const opt = programDataInfo.data.readUInt8(12);
  if (opt === 0) return 'none';
  if (opt === 1 && programDataInfo.data.length >= 45) {
    return new PublicKey(programDataInfo.data.slice(13, 45)).toBase58();
  }
  return 'unknown';
}

async function rpcWithRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  let delayMs = 400;
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('429') && !msg.toLowerCase().includes('too many requests')) {
        throw e;
      }
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function main(): Promise<void> {
  const rpc = argValue('--rpc') || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const deployWallet = process.env.DEVNET_DEPLOY_WALLET || 'B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5';

  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const solanaRoot = path.resolve(thisDir, '..');
  const repoRoot = path.resolve(solanaRoot, '..');
  const anchorTomlPath = path.join(solanaRoot, 'Anchor.toml');
  const outPath = path.join(repoRoot, 'docs', 'DEVNET_STATUS.md');

  const programs = readProgramsFromAnchorToml(anchorTomlPath);
  const connection = new Connection(rpc, 'confirmed');

  const walletPk = new PublicKey(deployWallet);
  const walletLamports = await rpcWithRetry(() => connection.getBalance(walletPk, 'confirmed'));

  const audits: ProgramAudit[] = [];
  let totalProgramLamports = 0;
  let maxProgramLamports = 0;

  for (const [name, programId] of Object.entries(programs)) {
    await sleep(120);
    const pk = new PublicKey(programId);
    const info = await rpcWithRetry(() => connection.getAccountInfo(pk, 'confirmed'));

    const upgradeAuthority = info ? await parseUpgradeAuthority(connection, pk) : 'unknown';

    const lamports = info?.lamports ?? 0;
    totalProgramLamports += lamports;
    if (lamports > maxProgramLamports) {
      maxProgramLamports = lamports;
    }

    audits.push({
      name,
      programId,
      executable: Boolean(info?.executable),
      owner: info?.owner?.toBase58() || 'missing',
      lamports,
      sol: (lamports / LAMPORTS_PER_SOL).toFixed(9),
      dataLength: info?.data?.length ?? 0,
      upgradeAuthority,
    });
  }

  const biggestRecentDeployCostLamports = maxProgramLamports;
  const reserveLamports = Math.max(
    5 * LAMPORTS_PER_SOL,
    2 * biggestRecentDeployCostLamports + 1 * LAMPORTS_PER_SOL,
  );

  const reserveStatus = walletLamports >= reserveLamports
    ? 'OK'
    : 'WARNING: below recommended reserve; upgrades may fail';

  const lines: string[] = [];
  lines.push('# Devnet Status Audit');
  lines.push('');
  lines.push(`- Generated at (UTC): ${new Date().toISOString()}`);
  lines.push(`- Deploy wallet: \`${deployWallet}\``);
  lines.push(`- RPC: \`${rpc}\``);
  lines.push('');
  lines.push('## Programs from Anchor.toml [programs.devnet]');
  lines.push('');
  lines.push('| Program | Program ID | Executable | Owner | Upgrade Authority | Data Length | Lamports | SOL |');
  lines.push('|---|---|---:|---|---|---:|---:|---:|');

  for (const p of audits) {
    lines.push(`| ${p.name} | \`${p.programId}\` | ${p.executable ? 'yes' : 'no'} | \`${p.owner}\` | \`${p.upgradeAuthority}\` | ${p.dataLength} | ${p.lamports} | ${p.sol} |`);
  }

  lines.push('');
  lines.push('## Funding / Reserve Summary');
  lines.push('');
  lines.push(`- Total SOL locked in program accounts: **${(totalProgramLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL** (${totalProgramLamports} lamports)`);
  lines.push(`- Deploy wallet balance: **${(walletLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL** (${walletLamports} lamports)`);
  lines.push(`- Biggest recent deploy-cost estimate (MVP proxy): **${(biggestRecentDeployCostLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL** (${biggestRecentDeployCostLamports} lamports)`);
  lines.push(`- Recommended reserve rule: \`max(5 SOL, 2x biggest_recent_deploy_cost + 1 SOL tx buffer)\``);
  lines.push(`- Recommended reserve: **${(reserveLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL** (${reserveLamports} lamports)`);
  lines.push(`- Reserve status: **${reserveStatus}**`);
  lines.push('');
  lines.push('## Upgrade Buffer Note');
  lines.push('');
  lines.push('- If a program has an upgrade authority, future upgrades require SOL to create/write a new buffer account before finalize. Keep the deploy wallet funded.');
  lines.push('');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));

  console.log(`Wrote ${outPath}`);
  console.log(`Programs audited: ${audits.length}`);
  console.log(`Total program SOL: ${(totalProgramLamports / LAMPORTS_PER_SOL).toFixed(9)}`);
  console.log(`Deploy wallet SOL: ${(walletLamports / LAMPORTS_PER_SOL).toFixed(9)}`);
  console.log(`Recommended reserve SOL: ${(reserveLamports / LAMPORTS_PER_SOL).toFixed(9)} (${reserveStatus})`);
}

main().catch((e) => {
  console.error('devnet_audit failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});

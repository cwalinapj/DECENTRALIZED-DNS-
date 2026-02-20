#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, PublicKey } from '@solana/web3.js';

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function readProgramsFromAnchorToml(anchorTomlPath: string): Record<string, string> {
  const content = fs.readFileSync(anchorTomlPath, 'utf8');
  const match = content.match(/\[programs\.devnet\]([\s\S]*?)(\n\[[^\]]+\]|$)/);
  if (!match) {
    throw new Error('Could not find [programs.devnet] section in Anchor.toml');
  }
  const block = match[1];
  const out: Record<string, string> = {};
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z0-9_\-]+)\s*=\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"\s*$/);
    if (!kv) continue;
    out[kv[1]] = kv[2];
  }
  return out;
}

function requiredPrograms(): string[] {
  const fromEnv = process.env.DDNS_REQUIRED_MVP_PROGRAMS;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const DEMO_CRITICAL_REQUIRED = [
    'ddns_anchor',
    'ddns_registry',
    'ddns_quorum',
    'ddns_stake',
  ];
  return DEMO_CRITICAL_REQUIRED;
}

async function main(): Promise<void> {
  const rpc = argValue('--rpc') || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const solanaRoot = path.resolve(thisDir, '..');
  const anchorTomlPath = path.join(solanaRoot, 'Anchor.toml');

  const programs = readProgramsFromAnchorToml(anchorTomlPath);
  const required = requiredPrograms();
  const connection = new Connection(rpc, 'confirmed');

  const missing: string[] = [];
  const notExecutable: string[] = [];
  const notInAnchor: string[] = [];

  for (const name of required) {
    const programId = programs[name];
    if (!programId) {
      notInAnchor.push(name);
      continue;
    }
    const info = await connection.getAccountInfo(new PublicKey(programId), 'confirmed');
    if (!info) {
      missing.push(`${name} (${programId})`);
      continue;
    }
    if (!info.executable) {
      notExecutable.push(`${name} (${programId})`);
    }
  }

  if (notInAnchor.length > 0 || missing.length > 0 || notExecutable.length > 0) {
    console.error('❌ required devnet programs missing/unusable');
    if (notInAnchor.length > 0) {
      console.error('Missing in Anchor.toml [programs.devnet]:');
      for (const n of notInAnchor) console.error(`- ${n}`);
    }
    if (missing.length > 0) {
      console.error('Missing:');
      for (const m of missing) console.error(`- ${m}`);
    }
    if (notExecutable.length > 0) {
      console.error('Not executable:');
      for (const n of notExecutable) console.error(`- ${n}`);
    }
    process.exit(1);
  }

  console.log(`✅ all required programs are deployed (${required.length})`);
}

main().catch((e) => {
  console.error('devnet_verify_deployed failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});

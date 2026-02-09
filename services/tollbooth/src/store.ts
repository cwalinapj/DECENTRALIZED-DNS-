import fs from "node:fs";
import path from "node:path";

export type PassportMapping = {
  wallet_pubkey: string;
  passport_mint: string;
  toll_pass_pda: string;
  name_record_pda: string;
  label: string;
  name_hash_hex: string;
  tx?: string;
  slot?: number;
  created_at: number;
};

export type RouteMapping = {
  wallet_pubkey: string;
  name: string;
  name_hash_hex: string;
  route_record_pda: string;
  dest: string;
  dest_hash_hex: string;
  ttl: number;
  tx: string;
  slot: number;
  updated_at: number;
};

export function ensureDbDirs(baseDir: string) {
  fs.mkdirSync(path.join(baseDir, "passports"), { recursive: true });
  fs.mkdirSync(path.join(baseDir, "routes"), { recursive: true });
}

function safeFileKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function writePassport(baseDir: string, p: PassportMapping) {
  const file = path.join(baseDir, "passports", `${safeFileKey(p.wallet_pubkey)}.json`);
  fs.writeFileSync(file, JSON.stringify(p, null, 2));
}

export function readPassport(baseDir: string, wallet: string): PassportMapping | null {
  const file = path.join(baseDir, "passports", `${safeFileKey(wallet)}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeRoute(baseDir: string, r: RouteMapping) {
  const key = `${safeFileKey(r.wallet_pubkey)}_${r.name_hash_hex}`;
  const file = path.join(baseDir, "routes", `${key}.json`);
  fs.writeFileSync(file, JSON.stringify(r, null, 2));
}

export function readRoute(baseDir: string, wallet: string, nameHashHex: string): RouteMapping | null {
  const key = `${safeFileKey(wallet)}_${nameHashHex}`;
  const file = path.join(baseDir, "routes", `${key}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

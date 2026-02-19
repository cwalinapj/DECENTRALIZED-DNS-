import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export type DdnsSolana = {
  connection: Connection;
  programId: PublicKey;
  idl: any;
  ixCoder: anchor.BorshInstructionCoder;
  acctCoder: anchor.BorshAccountsCoder;
  authority: Keypair;
};

const TOLL_PASS_LEGACY_SIZE = 32 + 8 + 32 + 32 + 32 + 1 + 1;
const TOLL_PASS_CURRENT_SIZE = 32 + 8 + 32 + 32 + 32 + 32 + 1 + 1;

export function sha25632(bytes: Uint8Array): Uint8Array {
  return crypto.createHash("sha256").update(bytes).digest();
}

export function sha25632Str(s: string): Uint8Array {
  return crypto.createHash("sha256").update(s).digest();
}

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function validateLabel(label: string): void {
  if (label.length < 3 || label.length > 32) throw new Error("label must be 3..32 chars");
  if (label.startsWith("-") || label.endsWith("-")) throw new Error("label cannot start/end with '-'");
  if (label.includes(".")) throw new Error("label cannot include '.'");
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error("label must match /^[a-z0-9-]+$/");
}

export function normalizeFullName(name: string): string {
  let n = name.trim().toLowerCase();
  if (!n.endsWith(".dns")) n = `${n}.dns`;
  return n;
}

export function nameHashFromFullName(fullNameLower: string): Uint8Array {
  return sha25632Str(fullNameLower);
}

export function nameHashFromLabel(labelLower: string): Uint8Array {
  return sha25632Str(`${labelLower}.dns`);
}

export function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function loadIdl(idlPath: string) {
  const p = path.resolve(idlPath);
  if (!fs.existsSync(p)) {
    throw new Error(`IDL not found at ${p}. Run 'anchor build' in solana/ first.`);
  }
  const idl = JSON.parse(fs.readFileSync(p, "utf8"));
  // Anchor JS sometimes expects account sizes.
  const sizeMap: Record<string, number> = {
    Config: 8 + 36,
    TollPass: 8 + 178,
    NameRecord: 8 + 146,
    RouteRecord: 8 + 117,
    TokenLock: 8 + 123,
  };
  if (Array.isArray(idl.accounts)) {
    for (const acct of idl.accounts) {
      if (acct && typeof acct === "object" && !acct.size && sizeMap[acct.name]) {
        acct.size = sizeMap[acct.name];
      }
    }
  }
  return idl;
}

export function createClient(env: {
  rpcUrl: string;
  programId: string;
  idlPath: string;
  authorityKeypairPath: string;
}): DdnsSolana {
  const connection = new Connection(env.rpcUrl, "confirmed");
  const programId = new PublicKey(env.programId);
  const authority = loadKeypair(env.authorityKeypairPath);
  const idl = loadIdl(env.idlPath);
  return {
    connection,
    programId,
    idl,
    ixCoder: new anchor.BorshInstructionCoder(idl),
    acctCoder: new anchor.BorshAccountsCoder(idl),
    authority,
  };
}

export function pdaConfig(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}

export function pdaTollPass(programId: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("toll_pass"), wallet.toBuffer()],
    programId
  )[0];
}

export function pdaNameRecord(programId: PublicKey, nameHash: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("name"), Buffer.from(nameHash)],
    programId
  )[0];
}

export function pdaRouteRecord(programId: PublicKey, wallet: PublicKey, nameHash: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("record"), wallet.toBuffer(), Buffer.from(nameHash)],
    programId
  )[0];
}

function keysFromIdl(ixDef: any, accountMap: Record<string, PublicKey>) {
  return ixDef.accounts.map((a: any) => {
    const pubkey = accountMap[a.name];
    if (!pubkey) {
      if (a.address) {
        return {
          pubkey: new PublicKey(a.address),
          isSigner: Boolean(a.signer),
          isWritable: Boolean(a.writable),
        };
      }
      throw new Error(`Missing account pubkey for ${a.name}`);
    }
    return {
      pubkey,
      isSigner: Boolean(a.isSigner ?? a.signer),
      isWritable: Boolean(a.isMut ?? a.writable),
    };
  });
}

export async function ensureInitialized(ddns: DdnsSolana): Promise<{ tx?: string }>{
  const config = pdaConfig(ddns.programId);
  const info = await ddns.connection.getAccountInfo(config, "confirmed");
  if (info) return {};

  const ixDef = ddns.idl.instructions?.find((i: any) => i.name === "initialize");
  if (!ixDef) throw new Error("IDL missing initialize instruction");

  const data = ddns.ixCoder.encode("initialize", { version: 1 });
  const keys = keysFromIdl(ixDef, {
    config,
    admin: ddns.authority.publicKey,
    system_program: SystemProgram.programId,
    systemProgram: SystemProgram.programId,
  });
  const ix = new TransactionInstruction({ programId: ddns.programId, keys, data });
  const tx = new Transaction().add(ix);
  const sig = await ddns.connection.sendTransaction(tx, [ddns.authority], { preflightCommitment: "confirmed" });
  await ddns.connection.confirmTransaction(sig, "confirmed");
  return { tx: sig };
}

export async function issuePassport(ddns: DdnsSolana, args: {
  ownerWallet: PublicKey;
  labelLower: string;
  pageCidHash?: Uint8Array;
  metadataHash?: Uint8Array;
}): Promise<{ tx: string; mint: PublicKey; tollPassPda: PublicKey; nameRecordPda: PublicKey; nameHash: Uint8Array }>{
  validateLabel(args.labelLower);

  const nameHash = nameHashFromLabel(args.labelLower);
  const config = pdaConfig(ddns.programId);
  const tollPassPda = pdaTollPass(ddns.programId, args.ownerWallet);
  const nameRecordPda = pdaNameRecord(ddns.programId, nameHash);

  const existing = await ddns.connection.getAccountInfo(tollPassPda, "confirmed");
  if (existing) {
    // Idempotent: do not mint again.
    const decoded = decodeTollPassCompat(ddns, existing.data);
    const mintPk = decoded.ownerMint ?? decoded.owner_mint;
    return { tx: "", mint: mintPk as PublicKey, tollPassPda, nameRecordPda, nameHash };
  }

  // Create mint controlled by tollbooth authority.
  const mint = await createMint(
    ddns.connection,
    ddns.authority,
    ddns.authority.publicKey,
    ddns.authority.publicKey,
    0,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );

  const ata = await getOrCreateAssociatedTokenAccount(
    ddns.connection,
    ddns.authority,
    mint,
    args.ownerWallet,
    false,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID
  );

  const ixDef = ddns.idl.instructions?.find((i: any) => i.name === "issue_toll_pass");
  if (!ixDef) throw new Error("IDL missing issue_toll_pass instruction");

  const data = ddns.ixCoder.encode("issue_toll_pass", {
    label: args.labelLower,
    name_hash: Buffer.from(nameHash),
    page_cid_hash: Buffer.from(args.pageCidHash ?? new Uint8Array(32)),
    metadata_hash: Buffer.from(args.metadataHash ?? new Uint8Array(32)),
  });

  const keys = keysFromIdl(ixDef, {
    config,
    toll_pass: tollPassPda,
    name_record: nameRecordPda,
    nft_mint: mint,
    nft_token_account: ata.address,
    owner_wallet: args.ownerWallet,
    authority: ddns.authority.publicKey,
    system_program: SystemProgram.programId,
    token_program: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const ix = new TransactionInstruction({ programId: ddns.programId, keys, data });
  const tx = new Transaction().add(ix);
  const sig = await ddns.connection.sendTransaction(tx, [ddns.authority], { preflightCommitment: "confirmed" });
  await ddns.connection.confirmTransaction(sig, "confirmed");

  return { tx: sig, mint, tollPassPda, nameRecordPda, nameHash };
}

export async function setRoute(ddns: DdnsSolana, args: {
  ownerWallet: PublicKey;
  fullNameLower: string;
  dest: string;
  ttl: number;
}): Promise<{ tx: string; routeRecordPda: PublicKey; nameRecordPda: PublicKey; nameHash: Uint8Array; destHash: Uint8Array; slot: number }>{
  const fullName = normalizeFullName(args.fullNameLower);
  const nameHash = nameHashFromFullName(fullName);
  const destHash = sha25632Str(args.dest);

  const config = pdaConfig(ddns.programId);
  const tollPass = pdaTollPass(ddns.programId, args.ownerWallet);
  const nameRecord = pdaNameRecord(ddns.programId, nameHash);
  const routeRecord = pdaRouteRecord(ddns.programId, args.ownerWallet, nameHash);

  const ixDef = ddns.idl.instructions?.find((i: any) => i.name === "set_route");
  if (!ixDef) throw new Error("IDL missing set_route instruction");

  const data = ddns.ixCoder.encode("set_route", {
    name: fullName,
    name_hash: Buffer.from(nameHash),
    dest_hash: Buffer.from(destHash),
    ttl: args.ttl,
  });

  const keys = keysFromIdl(ixDef, {
    config,
    route_record: routeRecord,
    name_record: nameRecord,
    toll_pass: tollPass,
    owner_wallet: args.ownerWallet,
    authority: ddns.authority.publicKey,
    system_program: SystemProgram.programId,
    systemProgram: SystemProgram.programId,
  });

  const ix = new TransactionInstruction({ programId: ddns.programId, keys, data });
  const tx = new Transaction().add(ix);
  const sig = await ddns.connection.sendTransaction(tx, [ddns.authority], { preflightCommitment: "confirmed" });
  await ddns.connection.confirmTransaction(sig, "confirmed");
  const status = await ddns.connection.getSignatureStatus(sig, { searchTransactionHistory: true });
  const slot = status?.value?.slot ?? 0;

  return { tx: sig, routeRecordPda: routeRecord, nameRecordPda: nameRecord, nameHash, destHash, slot };
}

export async function fetchRouteRecord(ddns: DdnsSolana, args: {
  ownerWallet: PublicKey;
  fullNameLower: string;
}): Promise<{ pda: PublicKey; slot: number; record: any } | null> {
  const fullName = normalizeFullName(args.fullNameLower);
  const nameHash = nameHashFromFullName(fullName);
  const pda = pdaRouteRecord(ddns.programId, args.ownerWallet, nameHash);

  const res = await ddns.connection.getAccountInfoAndContext(pda, "confirmed");
  if (!res.value) return null;
  const decoded = ddns.acctCoder.decode("RouteRecord", res.value.data) as any;
  return { pda, slot: res.context.slot, record: decoded };
}

export async function getPassportIfExists(ddns: DdnsSolana, wallet: PublicKey): Promise<any | null> {
  const pda = pdaTollPass(ddns.programId, wallet);
  const info = await ddns.connection.getAccountInfo(pda, "confirmed");
  if (!info) return null;
  return decodeTollPassCompat(ddns, info.data);
}

export async function getProgramAccountExists(ddns: DdnsSolana, pubkey: PublicKey): Promise<boolean> {
  const info = await ddns.connection.getAccountInfo(pubkey, "confirmed");
  return !!info;
}

function decodeLabelField(record: any): string | null {
  const len = Number(record?.label_len ?? record?.labelLen ?? 0);
  const raw = record?.label_bytes ?? record?.labelBytes;
  if (!raw || !Number.isFinite(len) || len <= 0) return null;
  const bytes = Array.isArray(raw) ? raw : Array.from(raw as Uint8Array);
  return Buffer.from(bytes.slice(0, len)).toString("utf8");
}

export async function listOwnedNames(ddns: DdnsSolana, wallet: PublicKey): Promise<string[]> {
  // NameRecord layout: discriminator(8) + name_hash(32) + owner_wallet(32) ...
  const accounts = await ddns.connection.getProgramAccounts(ddns.programId, {
    filters: [{ memcmp: { offset: 40, bytes: wallet.toBase58() } }],
  });
  const out = new Set<string>();
  for (const a of accounts) {
    try {
      const rec = ddns.acctCoder.decode("NameRecord", a.account.data) as any;
      const label = decodeLabelField(rec);
      if (!label) continue;
      out.add(`${label.toLowerCase()}.dns`);
    } catch {
      // Ignore non-NameRecord accounts returned by filter collisions.
    }
  }
  return [...out];
}

export async function ensureProgramExists(ddns: DdnsSolana): Promise<void> {
  const info = await ddns.connection.getAccountInfo(ddns.programId, "confirmed");
  if (!info) throw new Error(`program not found on cluster: ${ddns.programId.toBase58()}`);
}

function decodeTollPassCompat(ddns: DdnsSolana, data: Buffer | Uint8Array): any {
  try {
    return ddns.acctCoder.decode("TollPass", data) as any;
  } catch (err: any) {
    const legacy = decodeLegacyTollPassAccount(data);
    if (legacy) return legacy;
    throw err;
  }
}

export function decodeLegacyTollPassAccount(data: Buffer | Uint8Array): any | null {
  const buf = Buffer.from(data);
  const rawLen = buf.length;

  // Anchor account data may include an 8-byte discriminator prefix.
  const offStart =
    rawLen === TOLL_PASS_LEGACY_SIZE ? 0 :
    rawLen === TOLL_PASS_CURRENT_SIZE ? 0 :
    rawLen === 8 + TOLL_PASS_LEGACY_SIZE ? 8 :
    rawLen === 8 + TOLL_PASS_CURRENT_SIZE ? 8 :
    -1;
  if (offStart < 0) return null;

  let off = offStart;
  const end = buf.length;
  const need = TOLL_PASS_LEGACY_SIZE;
  if (end - off < need) return null;

  const owner = new PublicKey(buf.subarray(off, off + 32)); off += 32;
  const issuedAt = buf.readBigInt64LE(off); off += 8;
  const nameHash = Uint8Array.from(buf.subarray(off, off + 32)); off += 32;
  const ownerMint = new PublicKey(buf.subarray(off, off + 32)); off += 32;
  const pageCidHash = Uint8Array.from(buf.subarray(off, off + 32)); off += 32;

  let metadataHash: Uint8Array;
  if (end - off >= 34) {
    metadataHash = Uint8Array.from(buf.subarray(off, off + 32));
    off += 32;
  } else {
    metadataHash = new Uint8Array(32);
  }

  const bump = buf.readUInt8(off); off += 1;
  const initialized = buf.readUInt8(off) !== 0;

  return {
    owner,
    issuedAt,
    nameHash,
    ownerMint,
    pageCidHash,
    metadataHash,
    bump,
    initialized,
    owner_mint: ownerMint,
  };
}

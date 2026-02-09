import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";

export function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function readProgramIdFromAnchorToml(
  rpcUrl: string,
  programName: string
): string | null {
  try {
    const tomlPath = path.resolve("Anchor.toml");
    if (!fs.existsSync(tomlPath)) return null;
    const content = fs.readFileSync(tomlPath, "utf8");
    const isLocal = /127\\.0\\.0\\.1|localhost/.test(rpcUrl);
    const section = isLocal ? "programs.localnet" : "programs.devnet";
    const re = new RegExp(
      `\\[${section}\\][^\\[]*?${programName}\\s*=\\s*\"([^\"]+)\"`,
      "s"
    );
    const match = content.match(re);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function loadIdl(idlBasename: string, sizeMap: Record<string, number>) {
  const idlPath = path.resolve(`target/idl/${idlBasename}.json`);
  if (!fs.existsSync(idlPath)) {
    throw new Error(`IDL not found at ${idlPath}. Run 'anchor build' in /solana first.`);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  if (Array.isArray(idl.accounts)) {
    for (const acct of idl.accounts) {
      if (acct && typeof acct === "object" && !acct.size && sizeMap[acct.name]) {
        acct.size = sizeMap[acct.name];
      }
    }
  }
  return idl;
}

export function sha256(buf: Buffer | Uint8Array): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

export function parseHash32Hex(input?: string): Buffer {
  if (!input) return Buffer.alloc(32, 0);
  const hex = input.startsWith("0x") ? input.slice(2) : input;
  if (hex.length !== 64) throw new Error("hash must be 32 bytes hex (64 hex chars)");
  return Buffer.from(hex, "hex");
}

export function nameHashFromDnsName(name: string): Buffer {
  const norm = name.trim().toLowerCase();
  if (!norm.endsWith(".dns")) throw new Error("name must end with .dns");
  return sha256(Buffer.from(norm, "utf8"));
}

export function u64ToLe(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

export function encodeVoucherV1(args: {
  payer: PublicKey;
  nameHash: Buffer;
  amount: bigint;
  mint: PublicKey;
  nonce: bigint;
  validAfterSlot: bigint;
  expiresAtSlot: bigint;
  contextHash: Buffer;
}): Buffer {
  if (args.nameHash.length !== 32) throw new Error("nameHash must be 32 bytes");
  if (args.contextHash.length !== 32) throw new Error("contextHash must be 32 bytes");
  const parts: Buffer[] = [];
  parts.push(Buffer.from([1])); // version
  parts.push(Buffer.from([0])); // voucher_type = 0 (toll)
  parts.push(args.payer.toBuffer());
  parts.push(args.nameHash);
  parts.push(u64ToLe(args.amount));
  parts.push(args.mint.toBuffer());
  parts.push(u64ToLe(args.nonce));
  parts.push(u64ToLe(args.validAfterSlot));
  parts.push(u64ToLe(args.expiresAtSlot));
  parts.push(args.contextHash);
  return Buffer.concat(parts);
}

export function voucherMessage(voucherBytes: Buffer): Buffer {
  return sha256(Buffer.concat([Buffer.from("DDNS_VOUCHER_V1", "utf8"), voucherBytes]));
}

export function decodeVoucherV1(buf: Buffer) {
  if (buf.length !== 162) {
    throw new Error(`unexpected voucher length ${buf.length}; expected 162`);
  }
  const version = buf.readUInt8(0);
  const voucherType = buf.readUInt8(1);
  const payer = new PublicKey(buf.subarray(2, 34));
  const nameHash = Buffer.from(buf.subarray(34, 66));
  const amount = buf.readBigUInt64LE(66);
  const mint = new PublicKey(buf.subarray(74, 106));
  const nonce = buf.readBigUInt64LE(106);
  const validAfterSlot = buf.readBigUInt64LE(114);
  const expiresAtSlot = buf.readBigUInt64LE(122);
  const contextHash = Buffer.from(buf.subarray(130, 162));
  return {
    version,
    voucherType,
    payer,
    nameHash,
    amount,
    mint,
    nonce,
    validAfterSlot,
    expiresAtSlot,
    contextHash,
  };
}

export function anchorProviderFromEnv() {
  return anchor.AnchorProvider.env();
}


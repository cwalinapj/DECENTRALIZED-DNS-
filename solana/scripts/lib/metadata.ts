import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "./token.js";

export const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export type Creator = {
  address: PublicKey;
  verified: boolean;
  share: number;
};

export type DataV2 = {
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creators: Creator[] | null;
  collection: null;
  uses: null;
};

function u8(value: number): Buffer {
  return Buffer.from([value & 0xff]);
}

function u16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}

function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value, 0);
  return out;
}

function u64(value: bigint | number): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value), 0);
  return out;
}

function encodeString(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  return Buffer.concat([u32(body.length), body]);
}

function encodeBool(value: boolean): Buffer {
  return u8(value ? 1 : 0);
}

function encodeOption<T>(value: T | null, encodeValue: (inner: T) => Buffer): Buffer {
  if (value == null) return u8(0);
  return Buffer.concat([u8(1), encodeValue(value)]);
}

function encodePublicKey(value: PublicKey): Buffer {
  return value.toBuffer();
}

function encodeCreator(value: Creator): Buffer {
  return Buffer.concat([
    encodePublicKey(value.address),
    encodeBool(value.verified),
    u8(value.share),
  ]);
}

function encodeCreators(value: Creator[] | null): Buffer {
  return encodeOption(value, (creators) => {
    const entries = creators.map(encodeCreator);
    return Buffer.concat([u32(entries.length), ...entries]);
  });
}

function encodeDataV2(data: DataV2): Buffer {
  return Buffer.concat([
    encodeString(data.name),
    encodeString(data.symbol),
    encodeString(data.uri),
    u16(data.sellerFeeBasisPoints),
    encodeCreators(data.creators),
    u8(0),
    u8(0),
  ]);
}

export function createCreateMetadataAccountV3Instruction(accounts: {
  metadata: PublicKey;
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  updateAuthority: PublicKey;
  systemProgram?: PublicKey;
  rent?: PublicKey;
}, args: {
  data: DataV2;
  isMutable: boolean;
  collectionDetails: null;
}, programId = MPL_TOKEN_METADATA_PROGRAM_ID): TransactionInstruction {
  const data = Buffer.concat([
    u8(33),
    encodeDataV2(args.data),
    encodeBool(args.isMutable),
    u8(0),
  ]);
  const keys = [
    { pubkey: accounts.metadata, isWritable: true, isSigner: false },
    { pubkey: accounts.mint, isWritable: false, isSigner: false },
    { pubkey: accounts.mintAuthority, isWritable: false, isSigner: true },
    { pubkey: accounts.payer, isWritable: true, isSigner: true },
    { pubkey: accounts.updateAuthority, isWritable: false, isSigner: false },
    { pubkey: accounts.systemProgram ?? SystemProgram.programId, isWritable: false, isSigner: false },
  ];
  if (accounts.rent) {
    keys.push({ pubkey: accounts.rent, isWritable: false, isSigner: false });
  }
  return new TransactionInstruction({ programId, keys, data });
}

export function createUpdateMetadataAccountV2Instruction(accounts: {
  metadata: PublicKey;
  updateAuthority: PublicKey;
}, args: {
  data: DataV2 | null;
  updateAuthority: PublicKey | null;
  primarySaleHappened: boolean | null;
  isMutable: boolean | null;
}, programId = MPL_TOKEN_METADATA_PROGRAM_ID): TransactionInstruction {
  const data = Buffer.concat([
    u8(15),
    encodeOption(args.data, encodeDataV2),
    encodeOption(args.updateAuthority, encodePublicKey),
    encodeOption(args.primarySaleHappened, encodeBool),
    encodeOption(args.isMutable, encodeBool),
  ]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.metadata, isWritable: true, isSigner: false },
      { pubkey: accounts.updateAuthority, isWritable: false, isSigner: true },
    ],
    data,
  });
}

export function createCreateMasterEditionV3Instruction(accounts: {
  edition: PublicKey;
  mint: PublicKey;
  updateAuthority: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  metadata: PublicKey;
  tokenProgram?: PublicKey;
  systemProgram?: PublicKey;
  rent?: PublicKey;
}, args: {
  maxSupply: bigint | number | null;
}, programId = MPL_TOKEN_METADATA_PROGRAM_ID): TransactionInstruction {
  const data = Buffer.concat([
    u8(17),
    encodeOption(args.maxSupply, u64),
  ]);
  const keys = [
    { pubkey: accounts.edition, isWritable: true, isSigner: false },
    { pubkey: accounts.mint, isWritable: true, isSigner: false },
    { pubkey: accounts.updateAuthority, isWritable: false, isSigner: true },
    { pubkey: accounts.mintAuthority, isWritable: false, isSigner: true },
    { pubkey: accounts.payer, isWritable: true, isSigner: true },
    { pubkey: accounts.metadata, isWritable: true, isSigner: false },
    { pubkey: accounts.tokenProgram ?? TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    { pubkey: accounts.systemProgram ?? SystemProgram.programId, isWritable: false, isSigner: false },
  ];
  if (accounts.rent) {
    keys.push({ pubkey: accounts.rent, isWritable: false, isSigner: false });
  }
  return new TransactionInstruction({ programId, keys, data });
}

export function defaultMetadataRent(): PublicKey {
  return SYSVAR_RENT_PUBKEY;
}

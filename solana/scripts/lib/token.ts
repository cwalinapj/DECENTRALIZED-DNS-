import {
  AccountInfo,
  Commitment,
  ConfirmOptions,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Signer,
} from "@solana/web3.js";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const MINT_SIZE = 82;
export const ACCOUNT_SIZE = 165;

const TOKEN_INSTRUCTION_INITIALIZE_MINT = 0;
const TOKEN_INSTRUCTION_INITIALIZE_ACCOUNT = 1;
const TOKEN_INSTRUCTION_MINT_TO = 7;
const TOKEN_INSTRUCTION_INITIALIZE_MINT_2 = 20;

export type TokenAccount = {
  address: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  delegate: PublicKey | null;
  delegatedAmount: bigint;
  isInitialized: boolean;
  isFrozen: boolean;
  isNative: boolean;
  rentExemptReserve: bigint | null;
  closeAuthority: PublicKey | null;
};

export type MintAccount = {
  address: PublicKey;
  mintAuthority: PublicKey | null;
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: PublicKey | null;
};

export function getAssociatedTokenAddressSync(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
): PublicKey {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBuffer())) {
    throw new Error("TokenOwnerOffCurveError");
  }
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  )[0];
}

export async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
): Promise<PublicKey> {
  return getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve, programId, associatedTokenProgramId);
}

export function createInitializeMintInstruction(
  mint: PublicKey,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  programId = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.alloc(67);
  data.writeUInt8(TOKEN_INSTRUCTION_INITIALIZE_MINT, 0);
  data.writeUInt8(decimals, 1);
  mintAuthority.toBuffer().copy(data, 2);
  if (freezeAuthority) {
    data.writeUInt8(1, 34);
    freezeAuthority.toBuffer().copy(data, 35);
  } else {
    data.writeUInt8(0, 34);
  }
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function createInitializeMint2Instruction(
  mint: PublicKey,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  programId = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.alloc(67);
  data.writeUInt8(TOKEN_INSTRUCTION_INITIALIZE_MINT_2, 0);
  data.writeUInt8(decimals, 1);
  mintAuthority.toBuffer().copy(data, 2);
  if (freezeAuthority) {
    data.writeUInt8(1, 34);
    freezeAuthority.toBuffer().copy(data, 35);
  } else {
    data.writeUInt8(0, 34);
  }
  return new TransactionInstruction({
    programId,
    keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
    data,
  });
}

export function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: associatedTokenProgramId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

export function createMintToInstruction(
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: bigint | number,
  multiSigners: Signer[] = [],
  programId = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.alloc(9);
  data.writeUInt8(TOKEN_INSTRUCTION_MINT_TO, 0);
  data.writeBigUInt64LE(BigInt(amount), 1);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer.publicKey,
        isSigner: true,
        isWritable: false,
      })),
    ],
    data,
  });
}

export function createInitializeAccountInstruction(
  account: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  programId = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  const data = Buffer.from([TOKEN_INSTRUCTION_INITIALIZE_ACCOUNT]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function createMint(
  connection: Connection,
  payer: Signer,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number,
  keypair: Keypair = Keypair.generate(),
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_PROGRAM_ID,
): Promise<PublicKey> {
  const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, confirmOptions?.commitment);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: keypair.publicKey,
      space: MINT_SIZE,
      lamports,
      programId,
    }),
    createInitializeMint2Instruction(keypair.publicKey, decimals, mintAuthority, freezeAuthority, programId),
  );
  await sendAndConfirmTransaction(connection, tx, [payer, keypair], confirmOptions);
  return keypair.publicKey;
}

export async function createAssociatedTokenAccount(
  connection: Connection,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey,
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
  allowOwnerOffCurve = false,
): Promise<PublicKey> {
  const associatedToken = getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    programId,
    associatedTokenProgramId,
  );
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedToken,
      owner,
      mint,
      programId,
      associatedTokenProgramId,
    ),
  );
  await sendAndConfirmTransaction(connection, tx, [payer], confirmOptions);
  return associatedToken;
}

function parseTokenAccount(info: AccountInfo<Buffer>, address: PublicKey, programId: PublicKey): TokenAccount {
  if (!info.owner.equals(programId)) {
    throw new Error(`Token account ${address.toBase58()} is owned by ${info.owner.toBase58()}, expected ${programId.toBase58()}`);
  }
  if (info.data.length < ACCOUNT_SIZE) {
    throw new Error(`Token account ${address.toBase58()} is too small: ${info.data.length}`);
  }
  const data = info.data;
  const delegateOption = data.readUInt32LE(72);
  const state = data.readUInt8(108);
  const isNativeOption = data.readUInt32LE(109);
  const closeAuthorityOption = data.readUInt32LE(129);
  return {
    address,
    mint: new PublicKey(data.subarray(0, 32)),
    owner: new PublicKey(data.subarray(32, 64)),
    amount: data.readBigUInt64LE(64),
    delegate: delegateOption ? new PublicKey(data.subarray(76, 108)) : null,
    isInitialized: state !== 0,
    isFrozen: state === 2,
    delegatedAmount: data.readBigUInt64LE(121),
    isNative: isNativeOption !== 0,
    rentExemptReserve: isNativeOption ? data.readBigUInt64LE(113) : null,
    closeAuthority: closeAuthorityOption ? new PublicKey(data.subarray(133, 165)) : null,
  };
}

export async function getAccount(
  connection: Connection,
  address: PublicKey,
  commitment?: Commitment,
  programId = TOKEN_PROGRAM_ID,
): Promise<TokenAccount> {
  const info = await connection.getAccountInfo(address, commitment);
  if (!info) throw new Error(`Token account not found: ${address.toBase58()}`);
  return parseTokenAccount(info, address, programId);
}

export async function getMint(
  connection: Connection,
  address: PublicKey,
  commitment?: Commitment,
  programId = TOKEN_PROGRAM_ID,
): Promise<MintAccount> {
  const info = await connection.getAccountInfo(address, commitment);
  if (!info) throw new Error(`Mint not found: ${address.toBase58()}`);
  if (!info.owner.equals(programId)) {
    throw new Error(`Mint ${address.toBase58()} is owned by ${info.owner.toBase58()}, expected ${programId.toBase58()}`);
  }
  if (info.data.length < MINT_SIZE) {
    throw new Error(`Mint ${address.toBase58()} is too small: ${info.data.length}`);
  }
  const data = info.data;
  const mintAuthorityOption = data.readUInt32LE(0);
  const freezeAuthorityOption = data.readUInt32LE(46);
  return {
    address,
    mintAuthority: mintAuthorityOption ? new PublicKey(data.subarray(4, 36)) : null,
    supply: data.readBigUInt64LE(36),
    decimals: data.readUInt8(44),
    isInitialized: data.readUInt8(45) !== 0,
    freezeAuthority: freezeAuthorityOption ? new PublicKey(data.subarray(50, 82)) : null,
  };
}

export async function getOrCreateAssociatedTokenAccount(
  connection: Connection,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  commitment?: Commitment,
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
): Promise<TokenAccount> {
  const associatedToken = getAssociatedTokenAddressSync(
    mint,
    owner,
    allowOwnerOffCurve,
    programId,
    associatedTokenProgramId,
  );
  const existing = await connection.getAccountInfo(associatedToken, commitment);
  if (!existing) {
    try {
      await createAssociatedTokenAccount(
        connection,
        payer,
        mint,
        owner,
        confirmOptions,
        programId,
        associatedTokenProgramId,
        allowOwnerOffCurve,
      );
    } catch {
      // Another client may have created it first.
    }
  }
  return getAccount(connection, associatedToken, commitment, programId);
}

export async function mintTo(
  connection: Connection,
  payer: Signer,
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey | Signer,
  amount: bigint | number,
  multiSigners: Signer[] = [],
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_PROGRAM_ID,
): Promise<string> {
  const authorityPublicKey = authority instanceof PublicKey ? authority : authority.publicKey;
  const extraSigners = authority instanceof PublicKey ? multiSigners : [authority, ...multiSigners];
  const tx = new Transaction().add(
    createMintToInstruction(mint, destination, authorityPublicKey, amount, multiSigners, programId),
  );
  return sendAndConfirmTransaction(connection, tx, [payer, ...extraSigners], confirmOptions);
}

export async function createAccount(
  connection: Connection,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey,
  keypair?: Keypair,
  confirmOptions?: ConfirmOptions,
  programId = TOKEN_PROGRAM_ID,
): Promise<PublicKey> {
  if (!keypair) {
    return createAssociatedTokenAccount(connection, payer, mint, owner, confirmOptions, programId);
  }
  const lamports = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE, confirmOptions?.commitment);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: keypair.publicKey,
      space: ACCOUNT_SIZE,
      lamports,
      programId,
    }),
    createInitializeAccountInstruction(keypair.publicKey, mint, owner, programId),
  );
  await sendAndConfirmTransaction(connection, tx, [payer, keypair], confirmOptions);
  return keypair.publicKey;
}

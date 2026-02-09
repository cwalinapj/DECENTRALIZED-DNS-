import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  RouteRecordV1,
  readRoute,
  readWitnesses,
  findRouteIdByFields,
} from "./route_lib.js";
import { guardWriteWithMultiRpc, parseRpcQuorumUrls } from "./_attack_mode.js";

function loadKeypair(filePath: string): anchor.web3.Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
}

function normalizeAndValidateLabel(input: string): string {
  let label = input.trim().toLowerCase();
  if (label.endsWith(".")) label = label.slice(0, -1);
  if (label.endsWith(".dns")) label = label.slice(0, -4);
  if (label.includes(".")) {
    throw new Error("name must be a label without dots (do not include .dns)");
  }
  if (label.length < 3 || label.length > 32) {
    throw new Error("label must be 3..32 characters");
  }
  if (label.startsWith("-") || label.endsWith("-")) {
    throw new Error("label must not start or end with '-'");
  }
  if (!/^[a-z0-9-]+$/.test(label)) {
    throw new Error("label must match /^[a-z0-9-]+$/");
  }
  return label;
}

function sha256Bytes(input: string): Uint8Array {
  return crypto.createHash("sha256").update(input).digest();
}

function loadIdl() {
  const idlPath = path.resolve("target/idl/ddns_anchor.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error(
      `IDL not found at ${idlPath}. Run 'anchor build' in /solana first.`
    );
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const sizeMap: Record<string, number> = {
    Config: 8 + 36,
    TollPass: 8 + 178,
    TokenLock: 8 + 123,
    NameRecord: 8 + 146,
    RouteRecord: 8 + 117,
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

function readProgramIdFromAnchorToml(rpcUrl: string): string | null {
  try {
    const tomlPath = path.resolve("Anchor.toml");
    if (!fs.existsSync(tomlPath)) return null;
    const content = fs.readFileSync(tomlPath, "utf8");
    const isLocal = /127\\.0\\.0\\.1|localhost/.test(rpcUrl);
    const section = isLocal ? "programs.localnet" : "programs.devnet";
    const re = new RegExp(`\\[${section}\\][^\\[]*?ddns_anchor\\s*=\\s*\"([^\"]+)\"`, "s");
    const match = content.match(re);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("name", { type: "string", demandOption: true })
    .option("dest", { type: "string", demandOption: true })
    .option("ttl", { type: "number", default: 300 })
    .option("update-only", {
      type: "boolean",
      default: false,
      describe: "Only update an existing record; do not create",
    })
    .option("create-only", {
      type: "boolean",
      default: false,
      describe: "Only create a new record; do not update",
    })
    .option("rpc", { type: "string" })
    .option("wallet", { type: "string" })
    .option("dry-run", { type: "boolean", default: false })
    .strict()
    .parse();

  if (argv.rpc) process.env.ANCHOR_PROVIDER_URL = argv.rpc;
  if (argv.wallet) process.env.ANCHOR_WALLET = argv.wallet;

  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || ".", ".config/solana/id.json");

  const payer = loadKeypair(walletPath);
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idl = loadIdl();
  let programId: PublicKey | null = null;
  try {
    const program = anchor.workspace.DdnsAnchor as anchor.Program;
    programId = program.programId;
  } catch {
    const fromToml = readProgramIdFromAnchorToml(rpcUrl);
    if (fromToml) programId = new PublicKey(fromToml);
  }
  if (!programId) {
    throw new Error("program id not found in Anchor workspace or Anchor.toml");
  }
  console.log("program_id:", programId.toBase58());

  const programInfo = await connection.getAccountInfo(programId, "confirmed");
  if (!programInfo) {
    throw new Error(`program id not found on this cluster: ${programId.toBase58()}`);
  }
  const accountsCoder = new anchor.BorshAccountsCoder(idl);
  const ixCoder = new anchor.BorshInstructionCoder(idl);

  const label = normalizeAndValidateLabel(argv.name);
  const fullName = `${label}.dns`;
  const nameHash = sha256Bytes(fullName);
  const destHash = sha256Bytes(argv.dest);

  const [recordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("record"), payer.publicKey.toBuffer(), Buffer.from(nameHash)],
    programId
  );
  const [nameRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("name"), Buffer.from(nameHash)],
    programId
  );
  const [tollPassPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("toll_pass"), payer.publicKey.toBuffer()],
    programId
  );

  console.log("provider_url:", rpcUrl);
  console.log("record_pda:", recordPda.toBase58());
  console.log("name_record_pda:", nameRecordPda.toBase58());
  console.log("toll_pass_pda:", tollPassPda.toBase58());
  console.log("label:", label);
  console.log("full_name:", fullName);
  console.log("name_hash:", Buffer.from(nameHash).toString("hex"));
  console.log("dest_hash:", Buffer.from(destHash).toString("hex"));
  console.log("ttl:", argv.ttl);

  // Attack-mode: fail closed for writes if RPCs disagree about the record account.
  const rpcUrls = parseRpcQuorumUrls(rpcUrl);
  const guard = await guardWriteWithMultiRpc({ account: recordPda.toBase58(), rpcUrls });
  if (!guard.ok) {
    console.error("attack_mode:", guard.mode, guard.reasons);
    console.error("multi_rpc_evidence:", guard.evidence);
    throw new Error("attack_mode_freeze_writes");
  }
  console.log("multi_rpc_ok:", { agreeing: guard.agreeingUrls, slot: guard.slot, dataHash: guard.dataHashHex });

  // Load route + witnesses from wallet-cache (required for booth)
  const owner = payer.publicKey.toBase58();
  const routeId = findRouteIdByFields({
    name: fullName,
    dest: argv.dest,
    ttl: argv.ttl,
    owner,
  });
  if (!routeId) {
    throw new Error(
      "route not found in wallet-cache; run route:create then route:sign-witness"
    );
  }
  const route = readRoute(routeId) as RouteRecordV1;
  const witnesses = readWitnesses(routeId);

  const boothUrl = process.env.TOLL_BOOTH_URL || "http://localhost:8787";

  const recordInfo = await connection.getAccountInfo(recordPda, "confirmed");
  if (!recordInfo && argv["update-only"]) {
    throw new Error("record does not exist; use create or omit --update-only");
  }
  if (recordInfo && argv["create-only"]) {
    throw new Error("record already exists; use update or omit --create-only");
  }
  const ixName = "set_route";
  const ixDef = idl.instructions?.find(
    (i: { name: string }) => i.name === ixName
  );
  if (!ixDef) {
    throw new Error(`IDL missing ${ixName} instruction`);
  }

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );

  const accountMap: Record<string, PublicKey> = {
    config: configPda,
    route_record: recordPda,
    name_record: nameRecordPda,
    toll_pass: tollPassPda,
    owner_wallet: payer.publicKey,
    authority: payer.publicKey,
    system_program: anchor.web3.SystemProgram.programId,
    systemProgram: anchor.web3.SystemProgram.programId,
  };
  const keys = ixDef.accounts.map(
    (a: { name: string; isMut?: boolean; isSigner?: boolean; writable?: boolean; signer?: boolean; address?: string }) => {
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
    }
  );
  const data = ixCoder.encode("set_route", {
    name: fullName,
    name_hash: nameHash,
    dest_hash: destHash,
    ttl: argv.ttl,
  });
  const ix = new TransactionInstruction({
    programId,
    keys,
    data,
  });

  if (argv["dry-run"]) {
    console.log("instruction:", {
      programId: ix.programId.toBase58(),
      keys: ix.keys.map((k) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      dataLength: ix.data.length,
    });
    console.log("action:", "set_route");
    console.log("dry_run: not sending transaction");
    return;
  }

  // Submit to toll booth for verification/quorum
  const resp = await fetch(`${boothUrl}/v1/route/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ route, witnesses }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`toll booth rejected: ${resp.status} ${body}`);
  }
  const boothResult = await resp.json();
  console.log("toll_booth:", boothResult);

  const tx = await provider.sendAndConfirm(new Transaction().add(ix), []);

  console.log("action:", "set_route");
  console.log("tx:", tx);

  const info = await connection.getAccountInfo(recordPda, "confirmed");
  if (!info) {
    throw new Error("record account not found after tx");
  }
  const decoded = accountsCoder.decode("RouteRecord", info.data) as any;
  const decodedOwner = decoded.owner;
  const decodedNameHash = decoded.nameHash ?? decoded.name_hash;
  const decodedDestHash = decoded.destHash ?? decoded.dest_hash;
  const decodedTtl = decoded.ttl;
  const decodedUpdatedAt = decoded.updatedAt ?? decoded.updated_at;
  if (decodedOwner) {
    console.log(
      "record_owner:",
      decodedOwner?.toBase58?.() ?? decodedOwner?.toString?.() ?? "unknown"
    );
  }
  if (decodedNameHash) {
    console.log("record_name_hash:", Buffer.from(decodedNameHash).toString("hex"));
  }
  if (decodedDestHash) {
    console.log("record_dest_hash:", Buffer.from(decodedDestHash).toString("hex"));
  }
  if (decodedTtl !== undefined) {
    console.log("record_ttl:", decodedTtl.toString());
  }
  if (decodedUpdatedAt) {
    console.log("record_updated_at:", decodedUpdatedAt.toString());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

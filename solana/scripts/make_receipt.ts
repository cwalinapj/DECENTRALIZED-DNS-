import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import nacl from "tweetnacl";
import * as anchor from "@coral-xyz/anchor";

type ReceiptV1 = {
  version: 1;
  name: string;
  name_hash: string; // hex
  dest: string;
  dest_hash: string; // hex
  ttl_s: number;
  observed_at_unix: number;
  wallet_pubkey: string;
  signature: string; // base64
};

function loadKeypair(filePath: string): anchor.web3.Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
}

function normalizeName(name: string): string {
  let n = name.trim().toLowerCase();
  if (n.endsWith(".")) n = n.slice(0, -1);
  if (!n.endsWith(".dns")) throw new Error("name must end with .dns");
  return n;
}

function canonicalizeDest(dest: string): string {
  // MVP canonicalization: keep minimal; tighten later.
  return dest.trim();
}

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function nameHash(nameLc: string): Buffer {
  return sha256(Buffer.from(nameLc, "utf8"));
}

function destHash(destCanonical: string): Buffer {
  return sha256(Buffer.from(destCanonical, "utf8"));
}

function receiptMsgHash(observedAtUnix: number, ttlS: number, name_hash: Buffer, dest_hash: Buffer): Buffer {
  const prefix = Buffer.from("DDNS_RECEIPT_V1", "utf8");
  const ts = Buffer.alloc(8);
  ts.writeBigInt64LE(BigInt(observedAtUnix));
  const ttl = Buffer.alloc(4);
  ttl.writeUInt32LE(ttlS >>> 0);
  return sha256(Buffer.concat([prefix, name_hash, dest_hash, ts, ttl]));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("name", { type: "string", demandOption: true, describe: ".dns name (example.dns)" })
    .option("dest", { type: "string", demandOption: true, describe: "Destination (canonicalized by trim in MVP)" })
    .option("ttl", { type: "number", default: 300 })
    .option("observed-at", { type: "number", describe: "Observed-at unix seconds (default now)" })
    .option("rpc", { type: "string", describe: "Unused (reserved for CLI consistency)" })
    .option("wallet", { type: "string", describe: "Keypair path override (default ANCHOR_WALLET / solana id.json)" })
    .option("out", { type: "string", describe: "Write receipt JSON to this path (default stdout)" })
    .strict()
    .parse();

  const walletPath =
    argv.wallet ||
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || ".", ".config/solana/id.json");
  const kp = loadKeypair(walletPath);

  const nameLc = normalizeName(argv.name);
  const destC = canonicalizeDest(argv.dest);
  const nh = nameHash(nameLc);
  const dh = destHash(destC);
  const observedAtUnix = Number.isFinite(argv["observed-at"])
    ? Math.floor(argv["observed-at"]!)
    : Math.floor(Date.now() / 1000);
  const ttlS = Math.floor(argv.ttl!);
  if (!Number.isFinite(ttlS) || ttlS <= 0) throw new Error("bad ttl");

  const msg = receiptMsgHash(observedAtUnix, ttlS, nh, dh);
  const sig = nacl.sign.detached(msg, kp.secretKey);

  const receipt: ReceiptV1 = {
    version: 1,
    name: nameLc,
    name_hash: nh.toString("hex"),
    dest: destC,
    dest_hash: dh.toString("hex"),
    ttl_s: ttlS,
    observed_at_unix: observedAtUnix,
    wallet_pubkey: kp.publicKey.toBase58(),
    signature: Buffer.from(sig).toString("base64"),
  };

  const outJson = JSON.stringify(receipt, null, 2);

  console.log("wallet_pubkey:", receipt.wallet_pubkey);
  console.log("name_lc:", nameLc);
  console.log("name_hash:", nh.toString("hex"));
  console.log("dest_hash:", dh.toString("hex"));
  console.log("msg_hash:", msg.toString("hex"));

  if (argv.out) {
    fs.writeFileSync(argv.out, outJson, "utf8");
    console.log("wrote_receipt:", argv.out);
    return;
  }

  process.stdout.write(outJson + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

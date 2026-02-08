import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import nacl from "tweetnacl";
import bs58 from "bs58";

function loadKeypair(filePath: string): Uint8Array {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Uint8Array.from(raw);
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${entries.join(",")}}`;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("mint", { type: "string", demandOption: true })
    .option("name", { type: "string", demandOption: true })
    .option("rrtype", { type: "string", demandOption: true })
    .option("value", { type: "string", demandOption: true })
    .option("ttl", { type: "number", default: 300 })
    .option("ts", { type: "number", default: Math.floor(Date.now() / 1000) })
    .option("wallet", {
      type: "string",
      describe: "Override ANCHOR_WALLET for signer",
    })
    .strict()
    .parse();

  const walletPath =
    argv.wallet ||
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || ".", ".config/solana/id.json");

  const secret = loadKeypair(walletPath);
  const pubkey = bs58.encode(secret.slice(32, 64));

  const payload = {
    mint: argv.mint,
    wallet_pubkey: pubkey,
    name: argv.name,
    rrtype: argv.rrtype,
    value: argv.value,
    ttl: argv.ttl,
    ts: argv.ts,
  };
  const hashHex = crypto
    .createHash("sha256")
    .update(canonicalize(payload))
    .digest("hex");
  const sig = nacl.sign.detached(Buffer.from(hashHex, "hex"), secret);

  const out = {
    ...payload,
    sig: Buffer.from(sig).toString("base64"),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

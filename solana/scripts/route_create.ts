import crypto from "node:crypto";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { RouteRecordV1, writeRoute } from "./route_lib.js";
import fs from "node:fs";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";

function loadKeypair(filePath: string): Uint8Array {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Uint8Array.from(raw);
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("name", { type: "string", demandOption: true })
    .option("dest", { type: "string", demandOption: true })
    .option("ttl", { type: "number", default: 300 })
    .option("wallet", {
      type: "string",
      describe: "Override ANCHOR_WALLET for owner pubkey",
    })
    .strict()
    .parse();

  const walletPath =
    argv.wallet ||
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || ".", ".config/solana/id.json");

  const secret = loadKeypair(walletPath);
  // Solana pubkey is last 32 bytes of the 64-byte secret key array.
  const ownerPubkey = new PublicKey(secret.slice(32, 64)).toBase58();

  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");

  const route: RouteRecordV1 = {
    v: 1,
    name: argv.name.trim().toLowerCase().replace(/\.$/, ""),
    dest: argv.dest,
    ttl: argv.ttl,
    issued_at: now,
    expires_at: now + argv.ttl,
    owner: ownerPubkey,
    nonce,
  };

  const id = writeRoute(route);
  console.log("route_id:", id);
  console.log("route_path:", `wallet-cache/routes/${id}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

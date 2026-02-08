import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  readRoute,
  routeId,
  appendWitness,
  WitnessAttestationV1,
} from "./route_lib.js";

function loadKeypair(filePath: string): Uint8Array {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Uint8Array.from(raw);
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("route-id", { type: "string", demandOption: true })
    .option("keypair", {
      type: "string",
      describe: "Witness keypair path",
    })
    .strict()
    .parse();

  const route = readRoute(argv["route-id"]);
  if (!route) {
    throw new Error("route not found in wallet-cache");
  }

  const computedId = routeId(route);
  if (computedId !== argv["route-id"]) {
    throw new Error("route_id does not match computed hash");
  }

  const walletPath =
    argv.keypair ||
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || ".", ".config/solana/id.json");
  const secret = loadKeypair(walletPath);

  const routeHashHex = computedId;
  const routeHashBytes = Buffer.from(routeHashHex, "hex");
  const sig = nacl.sign.detached(routeHashBytes, secret);
  const witnessPubkey = bs58.encode(secret.slice(32, 64));

  const att: WitnessAttestationV1 = {
    v: 1,
    route_id: routeHashHex,
    witness: witnessPubkey,
    sig: Buffer.from(sig).toString("base64"),
    ts: Math.floor(Date.now() / 1000),
  };

  appendWitness(routeHashHex, att);
  console.log("route_id:", routeHashHex);
  console.log("witness:", witnessPubkey);
  console.log("witness_attestation_path:", `wallet-cache/witnesses/${routeHashHex}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

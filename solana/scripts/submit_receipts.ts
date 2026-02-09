import fs from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

type ReceiptV1 = {
  version: 1;
  name: string;
  dest: string;
  ttl_s: number;
  observed_at_unix: number;
  wallet_pubkey: string;
  signature: string;
};

function normalizeInput(obj: any): ReceiptV1[] {
  if (!obj) throw new Error("empty input");
  if (Array.isArray(obj)) return obj as ReceiptV1[];
  if (Array.isArray(obj.receipts)) return obj.receipts as ReceiptV1[];
  if (obj.version === 1) return [obj as ReceiptV1];
  throw new Error("input must be a receipt, receipts array, or {receipts:[]}");
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("url", { type: "string", default: "http://localhost:8790" })
    .option("in", { type: "string", demandOption: true, describe: "Path to receipt JSON (single or array)" })
    .strict()
    .parse();

  const raw = JSON.parse(fs.readFileSync(argv.in, "utf8"));
  const receipts = normalizeInput(raw);

  const base = argv.url!.replace(/\/+$/, "");
  const endpoint = `${base}/v1/submit-receipts`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ receipts }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`miner error ${resp.status}: ${text}`);
  }
  process.stdout.write(text + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


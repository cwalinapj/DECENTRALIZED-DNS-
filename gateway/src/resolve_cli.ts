import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  createAdapterRegistry,
  createEnsAdapter,
  createIpfsAdapter,
  createPkdnsAdapter,
  createRecursiveAdapter,
  createSnsAdapter,
  type RouteAnswer
} from "./adapters/index.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("name", { type: "string", demandOption: true })
    .option("source", { type: "string", choices: ["auto", "pkdns", "recursive", "ens", "sns", "ipfs"] as const, default: "auto" })
    .option("timeout-ms", { type: "number", default: 5000 })
    .option("qtype", { type: "string", default: "A" })
    .option("solana-rpc", { type: "string", default: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com" })
    .option("ddns-registry-program-id", { type: "string", default: process.env.DDNS_REGISTRY_PROGRAM_ID || "" })
    .option("ddns-watchdog-policy-program-id", { type: "string", default: process.env.DDNS_WATCHDOG_POLICY_PROGRAM_ID || "" })
    .option("witness-url", { type: "string", default: process.env.DDNS_WITNESS_URL || "", describe: "HTTP endpoint that returns {dest, ttl_s} for resolve+verify" })
    .option("evm-rpc", { type: "string", default: process.env.EVM_RPC_URL || process.env.ETH_RPC_URL || "" })
    .option("evm-chain-id", { type: "number", default: Number(process.env.EVM_CHAIN_ID || "1") })
    .option("ipfs-gateway", { type: "string", default: process.env.IPFS_HTTP_GATEWAY_BASE_URL || "https://ipfs.io/ipfs" })
    .option("dest", { type: "string", describe: "optional dest string to validate against on-chain dest_hash (PKDNS)" })
    .strict()
    .parse();

  const registry = createAdapterRegistry({
    pkdns: createPkdnsAdapter({
      solanaRpcUrl: argv["solana-rpc"],
      ddnsRegistryProgramId: argv["ddns-registry-program-id"],
      ddnsWatchdogPolicyProgramId: argv["ddns-watchdog-policy-program-id"] || undefined
    }),
    recursive: createRecursiveAdapter({
      upstreamDohUrls: (process.env.UPSTREAM_DOH_URLS || "https://cloudflare-dns.com/dns-query,https://dns.google/dns-query")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      cachePath: process.env.CACHE_PATH || "gateway/.cache/rrset.json",
      staleMaxS: Number(process.env.STALE_MAX_S || "1800"),
      prefetchFraction: Number(process.env.PREFETCH_FRACTION || "0.1"),
      cacheMaxEntries: Number(process.env.CACHE_MAX_ENTRIES || "50000"),
      requestTimeoutMs: argv["timeout-ms"]
    }),
    ipfs: createIpfsAdapter({ httpGateways: [argv["ipfs-gateway"]] }),
    ens: createEnsAdapter({ rpcUrl: argv["evm-rpc"], chainId: argv["evm-chain-id"] }),
    sns: createSnsAdapter({ rpcUrl: argv["solana-rpc"] })
  });

  const input = {
    name: argv.name,
    nowUnix: Math.floor(Date.now() / 1000),
    network: "cli",
    opts: {
      timeoutMs: argv["timeout-ms"],
      solanaRpcUrl: argv["solana-rpc"],
      evmRpcUrl: argv["evm-rpc"],
      chainId: argv["evm-chain-id"],
      qtype: argv.qtype,
      dest: argv.dest,
      witnessUrl: argv["witness-url"] || undefined
    }
  };

  let ans: RouteAnswer;
  if (argv.source === "auto") {
    ans = await registry.resolveAuto(input);
  } else {
    ans = await registry.resolveWithSource({ ...input, source: argv.source as any, opts: { ...input.opts, sourceOverride: argv.source } });
  }
  process.stdout.write(JSON.stringify(ans, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(String(err?.message || err) + "\n");
  process.exit(1);
});

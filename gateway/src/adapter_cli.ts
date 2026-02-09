import { buildDefaultAdapters, resolveRouteAnswer } from "./route_adapters/index.js";

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function requireArg(name: string): string {
  const v = arg(name);
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

async function main() {
  const name = requireArg("name");

  const registryPath = arg("registry-path") || process.env.REGISTRY_PATH || "registry/snapshots/registry.json";
  const anchorStorePath = arg("anchor-store-path") || process.env.ANCHOR_STORE_PATH || "settlement/anchors/anchors.json";
  const solanaRpcUrl = arg("solana-rpc") || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const ethRpcUrl = arg("eth-rpc") || process.env.ETH_RPC_URL || "";
  const policyProgramId = arg("policy-program-id") || process.env.DDNS_WATCHDOG_POLICY_PROGRAM_ID || "";
  const ipfsGateway = arg("ipfs-gateway") || process.env.IPFS_HTTP_GATEWAY_BASE_URL || "https://ipfs.io/ipfs";
  const timeoutMs = Number(arg("timeout-ms") || process.env.REQUEST_TIMEOUT_MS || "5000");

  const adapters = buildDefaultAdapters({
    registryPath,
    anchorStorePath,
    solanaRpcUrl,
    ethRpcUrl,
    policyProgramId: policyProgramId || undefined,
    ipfsHttpGatewayBaseUrl: ipfsGateway
  });

  const ans = await resolveRouteAnswer(adapters, name, { timeoutMs });
  process.stdout.write(JSON.stringify(ans, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(String(err?.message || err) + "\n");
  process.exit(1);
});


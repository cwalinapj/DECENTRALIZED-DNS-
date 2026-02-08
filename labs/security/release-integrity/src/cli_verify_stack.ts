import { verifyImageAgainstChain } from "./verify_image.js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

const rpcUrl = mustEnv("EVM_RPC_URL");
const registry = mustEnv("BUILD_REGISTRY_CONTRACT");

// Map component -> image ref (matches docker-compose container_name defaults)
const components: Array<{ component: string; image: string }> = [
  { component: "edge-node", image: "ddns-edge-node" },
  { component: "watchdog", image: "ddns-watchdog" },
  { component: "ipfs-anchor", image: "ddns-ipfs-anchor" },
  { component: "miner-gui", image: "ddns-miner-gui" }
];

const only = process.env.DDNS_VERIFY_ONLY?.split(",").map(s => s.trim()).filter(Boolean);

const run = async () => {
  const list = only?.length ? components.filter(c => only.includes(c.component)) : components;

  const results = [];
  for (const c of list) {
    results.push(await verifyImageAgainstChain({
      component: c.component,
      image: c.image,
      rpcUrl,
      buildRegistry: registry
    }));
  }

  const failed = results.filter(r => !r.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));

  if (failed.length) process.exit(2);
};

run().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});

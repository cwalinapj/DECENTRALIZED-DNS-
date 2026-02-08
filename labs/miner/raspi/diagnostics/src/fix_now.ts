import { execFileSync } from "node:child_process";

function run(cmd: string, args: string[]) {
  execFileSync(cmd, args, { stdio: "ignore" });
}

const main = async () => {
  const actions: any[] = [];

  // Restart watchdog first (most common recovery step)
  try {
    run("docker", ["restart", "ddns-watchdog"]);
    actions.push({ action: "restart_watchdog", ok: true });
  } catch (e: any) {
    actions.push({ action: "restart_watchdog", ok: false, error: String(e?.message || e) });
  }

  // Best-effort pulls (safe; will fail if images are local-only)
  const images = ["ddns-edge-node", "ddns-watchdog", "ddns-ipfs-anchor", "ddns-miner-gui", "ddns-integrity-daemon"];
  for (const img of images) {
    try {
      run("docker", ["pull", img]);
      actions.push({ action: "pull_image", image: img, ok: true });
    } catch (e: any) {
      actions.push({ action: "pull_image", image: img, ok: false, error: String(e?.message || e) });
    }
  }

  process.stdout.write(JSON.stringify({ time: Math.floor(Date.now() / 1000), actions }, null, 2));
};

main();

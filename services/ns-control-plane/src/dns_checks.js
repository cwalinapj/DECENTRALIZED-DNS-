import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runDig(args) {
  const { stdout } = await execFileAsync("dig", args, {
    timeout: Number(process.env.NS_CONTROL_DIG_TIMEOUT_MS || "4000")
  });
  return String(stdout || "");
}

export function createDnsChecks(overrides = {}) {
  const dig = overrides.dig || runDig;

  return {
    async checkTxt(txtName, expectedToken) {
      const out = await dig(["+short", "TXT", txtName, "@1.1.1.1"]);
      const values = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/^"|"$/g, ""));
      return values.some((v) => v.includes(expectedToken));
    },
    async getNameservers(domain) {
      const out = await dig(["+short", "NS", domain, "@1.1.1.1"]);
      return out
        .split(/\r?\n/)
        .map((s) => s.trim().toLowerCase().replace(/\.$/, ""))
        .filter(Boolean);
    }
  };
}

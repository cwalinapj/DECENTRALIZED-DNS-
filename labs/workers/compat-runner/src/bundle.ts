import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function unpackBundle(zipPath: string, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync("unzip", ["-q", zipPath, "-d", outDir], { stdio: "inherit" });
}

export function readManifest(unpackedDir: string): any {
  const p = path.join(unpackedDir, "manifest.json");
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

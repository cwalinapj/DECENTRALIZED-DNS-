import fs from "node:fs";
import path from "node:path";
import type { StorageBackend, StorageResult } from "./types.js";

export function createLocalStorage(dataDir: string): StorageBackend {
  const baseDir = path.join(dataDir, "uploads");
  return {
    name: "local",
    async putObject(key: string, data: Buffer): Promise<StorageResult> {
      const target = path.join(baseDir, key);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      return { key, url: `file://${target}` };
    }
  };
}

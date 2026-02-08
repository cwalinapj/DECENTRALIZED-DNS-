import type { StorageBackend, StorageResult } from "./types.js";

export function createDualStorage(primary: StorageBackend, secondary: StorageBackend): StorageBackend {
  return {
    name: `dual:${primary.name}+${secondary.name}`,
    async putObject(key: string, data: Buffer): Promise<StorageResult> {
      const first = await primary.putObject(key, data);
      try {
        await secondary.putObject(key, data);
      } catch {
        // best-effort secondary
      }
      return first;
    }
  };
}

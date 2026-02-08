import type { StorageBackend, StorageResult } from "./types.js";

export function createIpfsStorage(): StorageBackend {
  const api = process.env.IPFS_API_URL || "";
  return {
    name: "ipfs",
    async putObject(key: string, _data: Buffer): Promise<StorageResult> {
      if (!api) {
        throw new Error("IPFS_API_URL not configured");
      }
      throw new Error("IPFS storage not yet implemented");
    }
  };
}

import type { StorageBackend, StorageResult } from "./types.js";

export function createB2Storage(): StorageBackend {
  const bucket = process.env.B2_BUCKET || "";
  return {
    name: "b2",
    async putObject(_key: string, _data: Buffer): Promise<StorageResult> {
      if (!bucket) {
        throw new Error("B2_BUCKET not configured");
      }
      throw new Error("B2 storage not yet implemented");
    }
  };
}

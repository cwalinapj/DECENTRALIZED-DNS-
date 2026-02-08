import type { StorageBackend, StorageResult } from "./types.js";
import { createLocalStorage } from "./local.js";
import { createIpfsStorage } from "./ipfs.js";
import { createB2Storage } from "./b2.js";
import { createDualStorage } from "./dual.js";

export type { StorageBackend, StorageResult } from "./types.js";

export function createStorageFromEnv(dataDir: string): StorageBackend {
  const backend = (process.env.STORAGE_BACKEND || "local").toLowerCase();
  if (backend === "ipfs") return createIpfsStorage();
  if (backend === "b2") return createB2Storage();
  if (backend === "dual") return createDualStorage(createLocalStorage(dataDir), createIpfsStorage());
  return createLocalStorage(dataDir);
}

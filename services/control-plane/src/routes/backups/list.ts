import type { ControlPlaneState, BackupRecord } from "../../types.js";

export function listBackups(state: ControlPlaneState): BackupRecord[] {
  return Array.from(state.backups.values());
}

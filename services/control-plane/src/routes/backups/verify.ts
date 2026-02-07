import type { ControlPlaneState, BackupRecord } from "../../types.js";

export function verifyBackup(state: ControlPlaneState, backupId: string): BackupRecord | undefined {
  const record = state.backups.get(backupId);
  if (!record) return undefined;
  record.status = "verified";
  return record;
}

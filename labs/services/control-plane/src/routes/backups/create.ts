import type { ControlPlaneState, BackupRecord } from "../../types.js";

export function createBackup(state: ControlPlaneState, scope = "all"): BackupRecord {
  const backupId = `bkp_${Math.random().toString(36).slice(2, 10)}`;
  const record: BackupRecord = {
    backup_id: backupId,
    scope,
    status: "created",
    created_at: new Date().toISOString()
  };
  state.backups.set(backupId, record);
  return record;
}

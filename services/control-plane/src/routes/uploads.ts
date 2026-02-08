import type { ControlPlaneState, UploadRecord } from "../types.js";

export function listUploads(state: ControlPlaneState): UploadRecord[] {
  return Array.from(state.uploads.values());
}

export function createUpload(state: ControlPlaneState, input: Partial<UploadRecord>): UploadRecord {
  if (!input.site_id || !input.filename || !input.content_type || !input.path) {
    throw new Error("invalid_upload");
  }
  const upload: UploadRecord = {
    upload_id: input.upload_id || `upl_${Math.random().toString(36).slice(2, 10)}`,
    site_id: input.site_id,
    filename: input.filename,
    content_type: input.content_type,
    path: input.path,
    created_at: new Date().toISOString()
  };
  state.uploads.set(upload.upload_id, upload);
  return upload;
}

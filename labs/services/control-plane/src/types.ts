export interface SiteRecord {
  site_id: string;
  name: string;
  domain?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface JobRecord {
  job_id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface UploadRecord {
  upload_id: string;
  site_id: string;
  filename: string;
  content_type: string;
  path: string;
  created_at: string;
}

export interface BackupRecord {
  backup_id: string;
  scope: string;
  status: "created" | "verified" | "restored";
  created_at: string;
}

export interface ControlPlaneState {
  dataDir: string;
  sites: Map<string, SiteRecord>;
  jobs: Map<string, JobRecord>;
  uploads: Map<string, UploadRecord>;
  backups: Map<string, BackupRecord>;
}

export type RouteContext = {
  req: import("node:http").IncomingMessage;
  res: import("node:http").ServerResponse;
  params: RegExpMatchArray | null;
  body: any;
  state: ControlPlaneState;
};

export type Route = {
  method: string;
  pattern: RegExp;
  handler: (ctx: RouteContext) => Promise<void> | void;
};

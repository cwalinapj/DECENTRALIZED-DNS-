import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { lookup as lookupMime } from "mime-types";
import AdmZip from "adm-zip";
import tar from "tar";
import type { ControlPlaneState, DeployRecord } from "../types.js";

export type DeployFile = {
  path: string;
  data: Buffer;
  content_type: string;
  size: number;
};

export type DeployInput = {
  site_id: string;
  files?: Array<{
    path: string;
    content_base64: string;
    content_type?: string;
  }>;
  archive_base64?: string;
  archive_name?: string;
};

function normalizePath(input: string): string {
  const cleaned = input.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..")) {
    throw new Error(`invalid_path:${input}`);
  }
  return cleaned;
}

function guessContentType(filePath: string): string {
  const guessed = lookupMime(filePath);
  if (typeof guessed === "string") return guessed;
  return "application/octet-stream";
}

function collectFilesFromDir(dir: string): DeployFile[] {
  const entries: DeployFile[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const items = fs.readdirSync(current, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        stack.push(full);
        continue;
      }
      const rel = normalizePath(path.relative(dir, full));
      const data = fs.readFileSync(full);
      entries.push({
        path: rel,
        data,
        content_type: guessContentType(rel),
        size: data.length
      });
    }
  }
  return entries;
}

function extractZip(buffer: Buffer): DeployFile[] {
  const zip = new AdmZip(buffer);
  return zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => {
      const rel = normalizePath(entry.entryName);
      const data = entry.getData();
      return {
        path: rel,
        data,
        content_type: guessContentType(rel),
        size: data.length
      };
    });
}

async function extractTar(buffer: Buffer, nameHint: string): Promise<DeployFile[]> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ddns-deploy-"));
  const archivePath = path.join(tempDir, nameHint || "deploy.tar");
  fs.writeFileSync(archivePath, buffer);
  await tar.x({ file: archivePath, cwd: tempDir });
  const entries = collectFilesFromDir(tempDir);
  fs.rmSync(tempDir, { recursive: true, force: true });
  return entries;
}

export async function materializeDeployFiles(input: DeployInput): Promise<DeployFile[]> {
  if (input.files && input.files.length > 0) {
    return input.files.map((file) => {
      const rel = normalizePath(file.path);
      const data = Buffer.from(file.content_base64, "base64");
      return {
        path: rel,
        data,
        content_type: file.content_type || guessContentType(rel),
        size: data.length
      };
    });
  }

  if (input.archive_base64) {
    const archive = Buffer.from(input.archive_base64, "base64");
    const nameHint = input.archive_name || "deploy.zip";
    if (nameHint.endsWith(".zip")) {
      return extractZip(archive);
    }
    if (nameHint.endsWith(".tar") || nameHint.endsWith(".tar.gz") || nameHint.endsWith(".tgz")) {
      return extractTar(archive, nameHint);
    }
    throw new Error("unsupported_archive");
  }

  throw new Error("missing_deploy_payload");
}

export function listDeploys(state: ControlPlaneState): DeployRecord[] {
  return Array.from(state.deploys.values());
}

export function nextDeployVersion(state: ControlPlaneState, site_id: string): number {
  const versions = Array.from(state.deploys.values())
    .filter((deploy) => deploy.site_id === site_id)
    .map((deploy) => deploy.version);
  if (!versions.length) return 1;
  return Math.max(...versions) + 1;
}

export function createDeployRecord(
  state: ControlPlaneState,
  input: Partial<DeployRecord>
): DeployRecord {
  if (!input.site_id || typeof input.version !== "number") {
    throw new Error("invalid_deploy");
  }
  const deploy: DeployRecord = {
    deploy_id: input.deploy_id || `dep_${Math.random().toString(36).slice(2, 10)}`,
    site_id: input.site_id,
    version: input.version,
    status: input.status || "stored",
    created_at: new Date().toISOString(),
    file_count: input.file_count ?? 0,
    total_bytes: input.total_bytes ?? 0
  };
  state.deploys.set(deploy.deploy_id, deploy);
  return deploy;
}

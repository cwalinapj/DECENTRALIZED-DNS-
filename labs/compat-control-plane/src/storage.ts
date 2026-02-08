import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type Site = {
  site_id: string;
  site_token: string;
  manifest: any;
  created_at: number;
};

export type Job = {
  id: string;
  site_id: string;
  upload_id: string;
  state: "queued" | "running" | "done" | "failed";
  created_at: number;
  started_at?: number;
  finished_at?: number;
  report_path?: string;
  error?: string;
};

export class Storage {
  root: string;
  sitesPath: string;
  uploadsDir: string;
  jobsDir: string;
  reportsDir: string;
  sites: Record<string, Site>;

  constructor(root = "./data") {
    this.root = root;
    this.sitesPath = path.join(root, "sites.json");
    this.uploadsDir = path.join(root, "uploads");
    this.jobsDir = path.join(root, "jobs");
    this.reportsDir = path.join(root, "reports");

    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    fs.mkdirSync(this.jobsDir, { recursive: true });
    fs.mkdirSync(this.reportsDir, { recursive: true });

    this.sites = {};
    this.loadSites();
  }

  private loadSites() {
    if (!fs.existsSync(this.sitesPath)) return;
    try { this.sites = JSON.parse(fs.readFileSync(this.sitesPath, "utf8")); }
    catch { this.sites = {}; }
  }
  private saveSites() {
    fs.writeFileSync(this.sitesPath, JSON.stringify(this.sites, null, 2));
  }

  upsertSite(site_id: string, manifest: any): Site {
    const existing = this.sites[site_id];
    const token = existing?.site_token ?? crypto.randomBytes(24).toString("hex");
    const site: Site = { site_id, site_token: token, manifest, created_at: existing?.created_at ?? Date.now() };
    this.sites[site_id] = site;
    this.saveSites();
    return site;
  }

  getSite(site_id: string): Site | null {
    return this.sites[site_id] || null;
  }

  newUploadId(): string {
    return crypto.randomBytes(12).toString("hex");
  }

  saveJob(job: Job) {
    fs.writeFileSync(path.join(this.jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2));
  }

  loadJob(id: string): Job | null {
    const p = path.join(this.jobsDir, `${id}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  }
}

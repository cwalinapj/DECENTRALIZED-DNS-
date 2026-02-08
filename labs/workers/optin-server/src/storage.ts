import fs from "node:fs";
import path from "node:path";
import { nowSec, type SiteConfig } from "./config.js";

type DB = {
  sites: Record<string, SiteConfig>;
};

export class Storage {
  private dbPath: string;
  private optinPath: string;
  private db: DB;

  constructor(private dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.dbPath = path.join(dataDir, "sites.json");
    this.optinPath = path.join(dataDir, "optins.jsonl");
    this.db = { sites: {} };
    this.load();
  }

  private load() {
    if (!fs.existsSync(this.dbPath)) return;
    const raw = fs.readFileSync(this.dbPath, "utf8");
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.sites && typeof parsed.sites === "object") this.db.sites = parsed.sites;
    } catch {
      // ignore corrupted file; start empty
      this.db = { sites: {} };
    }
  }

  private save() {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  getSite(site_id: string): SiteConfig | null {
    return this.db.sites[site_id] || null;
  }

  upsertSite(input: Omit<SiteConfig, "created_at" | "updated_at"> & Partial<Pick<SiteConfig, "created_at" | "updated_at">>): SiteConfig {
    const existing = this.db.sites[input.site_id];
    const created = existing?.created_at ?? input.created_at ?? nowSec();
    const updated = nowSec();
    const site: SiteConfig = { ...input, created_at: created, updated_at: updated };
    this.db.sites[input.site_id] = site;
    this.save();
    return site;
  }

  rotateSiteKey(site_id: string) {
    // placeholder if you later store per-site secret/tokens.
    // For now, we keep site auth purely by Origin allowlist + rate limit.
    return { ok: true };
  }

  appendOptin(record: any) {
    fs.appendFileSync(this.optinPath, JSON.stringify(record) + "\n");
  }
}

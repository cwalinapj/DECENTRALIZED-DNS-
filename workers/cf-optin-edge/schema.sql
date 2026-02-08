-- Sites (registry)
CREATE TABLE IF NOT EXISTS sites (
  site_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  allowed_origins_json TEXT NOT NULL,
  allowed_categories_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Opt-in submissions (append-only)
CREATE TABLE IF NOT EXISTS optins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at INTEGER NOT NULL,
  site_id TEXT NOT NULL,
  origin TEXT,
  ip TEXT,
  email TEXT,
  categories_json TEXT NOT NULL,
  page_url TEXT,
  client_ts INTEGER NOT NULL,
  nonce TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_optins_site_time ON optins(site_id, received_at);
CREATE INDEX IF NOT EXISTS idx_optins_nonce ON optins(nonce);

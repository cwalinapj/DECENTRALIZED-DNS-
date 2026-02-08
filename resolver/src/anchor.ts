import fs from "node:fs";
import path from "node:path";

export type AnchorRecord = {
  root: string;
  version: number;
  timestamp: string;
  source: string;
};

type AnchorStore = {
  latest: AnchorRecord | null;
  history: AnchorRecord[];
};

const DEFAULT_ANCHOR_PATH = path.resolve(process.cwd(), "settlement/anchors/anchors.json");

export function loadAnchorStore(anchorPath = DEFAULT_ANCHOR_PATH): AnchorStore {
  if (!fs.existsSync(anchorPath)) {
    const empty: AnchorStore = { latest: null, history: [] };
    fs.mkdirSync(path.dirname(anchorPath), { recursive: true });
    fs.writeFileSync(anchorPath, JSON.stringify(empty, null, 2) + "\n");
    return empty;
  }
  const raw = fs.readFileSync(anchorPath, "utf8");
  return JSON.parse(raw) as AnchorStore;
}

export function saveAnchorStore(store: AnchorStore, anchorPath = DEFAULT_ANCHOR_PATH) {
  fs.mkdirSync(path.dirname(anchorPath), { recursive: true });
  fs.writeFileSync(anchorPath, JSON.stringify(store, null, 2) + "\n");
}

export function anchorRoot(record: AnchorRecord, anchorPath = DEFAULT_ANCHOR_PATH): AnchorRecord {
  const store = loadAnchorStore(anchorPath);
  store.latest = record;
  store.history = [record, ...store.history].slice(0, 1000);
  saveAnchorStore(store, anchorPath);
  return record;
}

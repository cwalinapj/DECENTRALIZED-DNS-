import fs from "node:fs";
import path from "node:path";

function defaultState() {
  return { domains: {} };
}

export function createStore(filePath) {
  const abs = path.resolve(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  function read() {
    if (!fs.existsSync(abs)) return defaultState();
    try {
      const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : defaultState();
    } catch {
      return defaultState();
    }
  }

  function write(state) {
    fs.writeFileSync(abs, JSON.stringify(state, null, 2), "utf8");
  }

  return {
    getDomain(domain) {
      const state = read();
      return state.domains?.[domain] || null;
    },
    upsertDomain(domain, patch) {
      const state = read();
      const current = state.domains?.[domain] || {};
      const next = { ...current, ...patch };
      state.domains[domain] = next;
      write(state);
      return next;
    },
    listDomains() {
      return read().domains || {};
    }
  };
}

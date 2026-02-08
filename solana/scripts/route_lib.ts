import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type RouteRecordV1 = {
  v: 1;
  name: string;
  dest: string;
  ttl: number;
  issued_at: number;
  expires_at: number;
  owner: string;
  nonce: string;
};

export type WitnessAttestationV1 = {
  v: 1;
  route_id: string;
  witness: string;
  sig: string;
  ts: number;
};

export function walletCacheDir(): string {
  return path.resolve("wallet-cache");
}

export function routesDir(): string {
  return path.join(walletCacheDir(), "routes");
}

export function witnessesDir(): string {
  return path.join(walletCacheDir(), "witnesses");
}

export function ensureDirs() {
  fs.mkdirSync(routesDir(), { recursive: true });
  fs.mkdirSync(witnessesDir(), { recursive: true });
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return Number.isInteger(value) ? value.toString() : value.toString();
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]));
    return "{" + parts.join(",") + "}";
  }
  throw new Error("unsupported type in canonicalize");
}

export function routeId(route: RouteRecordV1): string {
  const canonical = canonicalize(route);
  const hash = crypto.createHash("sha256").update(canonical).digest("hex");
  return hash;
}

export function writeRoute(route: RouteRecordV1): string {
  ensureDirs();
  const id = routeId(route);
  const file = path.join(routesDir(), `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(route, null, 2));
  return id;
}

export function readRoute(id: string): RouteRecordV1 | null {
  const file = path.join(routesDir(), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function listRoutes(): string[] {
  if (!fs.existsSync(routesDir())) return [];
  return fs
    .readdirSync(routesDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function findRouteIdByFields(params: {
  name: string;
  dest: string;
  ttl: number;
  owner: string;
}): string | null {
  const ids = listRoutes();
  for (const id of ids) {
    const route = readRoute(id);
    if (!route) continue;
    if (
      route.name === params.name &&
      route.dest === params.dest &&
      route.ttl === params.ttl &&
      route.owner === params.owner
    ) {
      return id;
    }
  }
  return null;
}

export function readWitnesses(id: string): WitnessAttestationV1[] {
  const file = path.join(witnessesDir(), `${id}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function appendWitness(id: string, att: WitnessAttestationV1) {
  ensureDirs();
  const current = readWitnesses(id);
  current.push(att);
  const file = path.join(witnessesDir(), `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(current, null, 2));
}

import express from "express";
import dnsPacket from "dns-packet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyVoucherHeader } from "./voucher.js";
import { buildMerkleRoot, buildProof, loadSnapshot, normalizeName, verifyProof } from "./registry.js";
import { resolveEns, supportsEns } from "./adaptors/ens.js";
import { resolveSns, supportsSns } from "./adaptors/sns.js";
import { anchorRoot, loadAnchorStore, type AnchorRecord } from "./anchor.js";

const PORT = Number(process.env.PORT || "8054");
const HOST = process.env.HOST || "0.0.0.0";
const UPSTREAM_DOH_URL = process.env.UPSTREAM_DOH_URL || "https://cloudflare-dns.com/dns-query";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || "5000");
const CACHE_TTL_MAX_S = Number(process.env.CACHE_TTL_MAX_S || "3600");
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "development" ? "verbose" : "quiet");
const GATED_SUFFIXES = (process.env.GATED_SUFFIXES || ".premium")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const REGISTRY_ENABLED = process.env.REGISTRY_ENABLED === "1";
const REGISTRY_PATH = process.env.REGISTRY_PATH || "registry/snapshots/registry.json";
const ENABLE_ENS = process.env.ENABLE_ENS === "1";
const ENABLE_SNS = process.env.ENABLE_SNS === "1";
const ETH_RPC_URL = process.env.ETH_RPC_URL || "";
const ENS_NETWORK = process.env.ENS_NETWORK || "mainnet";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const SNS_CLUSTER = process.env.SNS_CLUSTER || "devnet";
const ANCHOR_STORE_PATH = process.env.ANCHOR_STORE_PATH || "settlement/anchors/anchors.json";
const REGISTRY_ADMIN_TOKEN = process.env.REGISTRY_ADMIN_TOKEN || "";
const NODE_AGGREGATOR_ENABLED = process.env.NODE_AGGREGATOR_ENABLED === "1";
const NODE_LIST_PATH = process.env.NODE_LIST_PATH || "config/example/nodes.json";
const NODE_QUORUM = Number(process.env.NODE_QUORUM || 3);

function logInfo(message: string) {
  if (LOG_LEVEL !== "quiet") {
    console.log(message);
  }
}

const cache = new Map<string, { expiresAt: number; payload: ResolveResponse }>();

export type ResolveRecord = { type: string; value: string; ttl?: number };
export type ResolveResponse = {
  name: string;
  network: string;
  records: ResolveRecord[];
  metadata: Record<string, unknown>;
};

function cacheGet(key: string): ResolveResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key: string, ttlMs: number, payload: ResolveResponse) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, payload });
}

async function resolveViaDoh(name: string): Promise<{ records: ResolveRecord[]; ttl: number }> {
  const query = dnsPacket.encode({
    type: "query",
    id: Math.floor(Math.random() * 65535),
    flags: dnsPacket.RECURSION_DESIRED,
    questions: [{ type: "A", name, class: "IN" }]
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(UPSTREAM_DOH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/dns-message",
        "accept": "application/dns-message"
      },
      body: Buffer.from(query),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`upstream_${res.status}`);
    }

    const arr = new Uint8Array(await res.arrayBuffer());
    const decoded = dnsPacket.decode(Buffer.from(arr)) as any;
    const answers = Array.isArray(decoded.answers) ? decoded.answers : [];

    const records = answers
      .filter((a: any) => a && a.type && a.data)
      .map((a: any) => ({ type: String(a.type), value: String(a.data), ttl: a.ttl }));

    const ttl = records.length > 0
      ? Math.max(30, Math.min(CACHE_TTL_MAX_S, Number(records[0].ttl || 60)))
      : 60;

    return { records, ttl };
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error("upstream_timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function createApp() {
  const app = express();

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  app.get("/registry/root", (_req, res) => {
    if (!REGISTRY_ENABLED) {
      return res.status(501).json({ error: { code: "REGISTRY_DISABLED", message: "registry not enabled" } });
    }
    const snapshot = loadSnapshot(REGISTRY_PATH);
    const root = buildMerkleRoot(snapshot.records);
    const anchor = loadAnchorStore(ANCHOR_STORE_PATH).latest;
    return res.json({ root, version: snapshot.version, updatedAt: snapshot.updatedAt, anchoredRoot: anchor });
  });

  app.get("/registry/proof", (req, res) => {
    if (!REGISTRY_ENABLED) {
      return res.status(501).json({ error: { code: "REGISTRY_DISABLED", message: "registry not enabled" } });
    }
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!name) return res.status(400).json({ error: "missing_name" });
    const snapshot = loadSnapshot(REGISTRY_PATH);
    const proof = buildProof(snapshot.records, name);
    return res.json({
      root: proof.root,
      leaf: proof.leaf,
      siblings: proof.proof.siblings,
      directions: proof.proof.directions,
      version: snapshot.version,
      updatedAt: snapshot.updatedAt
    });
  });

  app.post("/registry/anchor", express.json(), (req, res) => {
    if (!REGISTRY_ENABLED) {
      return res.status(501).json({ error: { code: "REGISTRY_DISABLED", message: "registry not enabled" } });
    }
    const token = typeof req.headers["x-admin-token"] === "string" ? req.headers["x-admin-token"] : "";
    if (!REGISTRY_ADMIN_TOKEN || token !== REGISTRY_ADMIN_TOKEN) {
      return res.status(403).json({ error: { code: "UNAUTHORIZED", message: "admin token required" } });
    }
    const body = req.body as Partial<AnchorRecord>;
    if (!body?.root || !body?.version || !body?.timestamp || !body?.source) {
      return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "missing anchor fields" } });
    }
    const record: AnchorRecord = {
      root: String(body.root),
      version: Number(body.version),
      timestamp: String(body.timestamp),
      source: String(body.source)
    };
    const anchored = anchorRoot(record, ANCHOR_STORE_PATH);
    return res.json({ anchored });
  });

  app.get("/resolve", async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!name) return res.status(400).json({ error: "missing_name" });
    const proofRequested = req.query.proof === "1" || req.query.proof === "true";

    const lowered = name.toLowerCase();
    const gated = GATED_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
    if (gated) {
      const voucherHeader = typeof req.headers["x-ddns-voucher"] === "string"
        ? req.headers["x-ddns-voucher"]
        : "";
      const voucherCheck = verifyVoucherHeader(voucherHeader);
      if (!voucherCheck.ok) {
        const status = voucherCheck.code === "VOUCHER_REQUIRED"
          ? 402
          : voucherCheck.code === "VOUCHER_NOT_IMPLEMENTED"
            ? 501
            : 403;
        return res.status(status).json({
          error: {
            code: voucherCheck.code,
            message: voucherCheck.message,
            retryable: voucherCheck.retryable
          }
        });
      }
    }

    if (lowered.endsWith(".dns") && !REGISTRY_ENABLED) {
      return res.status(501).json({
        error: { code: "REGISTRY_DISABLED", message: "registry not enabled", retryable: false }
      });
    }

    if (REGISTRY_ENABLED && lowered.endsWith(".dns")) {
      const snapshot = loadSnapshot(REGISTRY_PATH);
      const normalized = normalizeName(name);
      const entry = snapshot.records.find((record) => normalizeName(record.name) === normalized);
      if (!entry) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "record not found", retryable: false } });
      }
      const computedRoot = buildMerkleRoot(snapshot.records);
      const anchor = loadAnchorStore(ANCHOR_STORE_PATH).latest;
      if (anchor && anchor.root !== computedRoot) {
        return res.status(409).json({
          error: { code: "ANCHOR_MISMATCH", message: "anchored root does not match snapshot", retryable: false }
        });
      }
      const root = anchor?.root || computedRoot;
      const proof = proofRequested ? buildProof(snapshot.records, name) : null;
      if (proofRequested && proof && !verifyProof(root, proof.leaf, proof.proof)) {
        return res.status(500).json({
          error: { code: "PROOF_INVALID", message: "proof failed to verify", retryable: false }
        });
      }
      const payload: ResolveResponse = {
        name,
        network: "dns",
        records: entry.records,
        metadata: {
          source: "registry",
          registryVersion: snapshot.version,
          registryUpdatedAt: snapshot.updatedAt,
          root,
          ...(proofRequested && proof ? {
            proof: {
              root,
              version: snapshot.version,
              leaf: proof.leaf,
              siblings: proof.proof.siblings,
              directions: proof.proof.directions
            }
          } : {})
        }
      };
      return res.json(payload);
    }

    if (ENABLE_ENS && supportsEns(name)) {
      try {
        const records = await resolveEns(name, { rpcUrl: ETH_RPC_URL, timeoutMs: REQUEST_TIMEOUT_MS });
        if (!records.length) {
          return res.status(404).json({ error: { code: "NOT_FOUND", message: "ENS record not found", retryable: false } });
        }
        return res.json({
          name,
          network: "ens",
          records,
          metadata: {
            source: "ens",
            network: ENS_NETWORK
          }
        });
      } catch (err: any) {
        const msg = String(err?.message || err);
        const code = msg === "ENS_TIMEOUT" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
        return res.status(502).json({ error: { code, message: msg, retryable: true } });
      }
    }

    if (ENABLE_SNS && supportsSns(name)) {
      try {
        const records = await resolveSns(name, { rpcUrl: SOLANA_RPC_URL, timeoutMs: REQUEST_TIMEOUT_MS });
        if (!records.length) {
          return res.status(404).json({ error: { code: "NOT_FOUND", message: "SNS record not found", retryable: false } });
        }
        return res.json({
          name,
          network: "sns",
          records,
          metadata: {
            source: "sns",
            cluster: SNS_CLUSTER
          }
        });
      } catch (err: any) {
        const msg = String(err?.message || err);
        const code = msg === "SNS_TIMEOUT" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
        return res.status(502).json({ error: { code, message: msg, retryable: true } });
      }
    }

    const cacheKey = `resolve:${name.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, metadata: { ...cached.metadata, cache: "hit" } });
    }

    try {
      const { records, ttl } = await resolveViaDoh(name);
      const payload: ResolveResponse = {
        name,
        network: "icann",
        records,
        metadata: {
          source: "doh",
          cache: "miss"
        }
      };
      if (NODE_AGGREGATOR_ENABLED) {
        const nodeResult = await verifyWithNodes(name, payload);
        if (!nodeResult.ok) {
          return res.status(502).json({ error: { code: "NODE_QUORUM_FAILED", message: nodeResult.message, retryable: true } });
        }
        payload.metadata = { ...payload.metadata, nodeQuorum: nodeResult.quorum, nodeMatches: nodeResult.matches };
      }
      cacheSet(cacheKey, ttl * 1000, payload);
      return res.json(payload);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const code = msg === "upstream_timeout" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
      return res.status(502).json({ error: { code, message: msg, retryable: true } });
    }
  });

  return app;
}

async function verifyWithNodes(name: string, authoritative: ResolveResponse): Promise<{ ok: boolean; message?: string; quorum?: number; matches?: number }> {
  const nodes = await loadNodeList();
  if (!nodes.length) return { ok: true, quorum: 0, matches: 0 };
  const responses = await Promise.all(nodes.map((node) => fetchNodeResolve(node, name)));
  const normalizedAuth = normalizeRecords(authoritative.records);
  let matches = 0;
  for (const res of responses) {
    if (!res) continue;
    const normalized = normalizeRecords(res.records || []);
    if (normalized === normalizedAuth) matches += 1;
  }
  const quorum = Math.min(NODE_QUORUM, nodes.length);
  if (matches < quorum) {
    return { ok: false, message: `quorum_failed:${matches}/${quorum}` };
  }
  return { ok: true, quorum, matches };
}

async function loadNodeList(): Promise<string[]> {
  try {
    const raw = await import("node:fs").then((mod) => mod.readFileSync(NODE_LIST_PATH, "utf8"));
    const parsed = JSON.parse(raw) as { nodes?: string[] };
    return Array.isArray(parsed.nodes) ? parsed.nodes : [];
  } catch {
    return [];
  }
}

async function fetchNodeResolve(baseUrl: string, name: string): Promise<ResolveResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const url = `${normalizedBase}/wp-json/ddns/v1/resolve?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRecords(records: ResolveRecord[]): string {
  const normalized = [...records]
    .map((r) => ({ type: r.type, value: r.value, ttl: r.ttl }))
    .sort((a, b) => `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`));
  return JSON.stringify(normalized);
}

const app = createApp();

const modulePath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (modulePath === entryPath) {
  app.listen(PORT, HOST, () => {
    logInfo(`Listening on ${HOST}:${PORT}`);
  });
}

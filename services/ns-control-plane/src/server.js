import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { normalizeDomain } from "./domain.js";
import { createVerificationToken } from "./token.js";
import { createStore } from "./store.js";
import { createPdnsClient } from "./pdns_client.js";
import { createDnsChecks } from "./dns_checks.js";

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString()
  });
  res.end(body);
}

function readBody(req, callback) {
  let raw = "";
  let bytes = 0;
  let rejected = false;
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_BODY_BYTES && !rejected) {
      rejected = true;
      callback(new Error("request_too_large"));
      req.destroy();
      return;
    }
    if (!rejected) raw += chunk;
  });
  req.on("end", () => {
    if (rejected) return;
    try {
      callback(null, raw ? JSON.parse(raw) : {});
    } catch {
      callback(new Error("invalid_json"));
    }
  });
}

function nowIso() {
  return new Date().toISOString();
}

function ipHash(req) {
  const raw = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function createDefaultDeps() {
  const dbPath = process.env.NS_CONTROL_DB_PATH || path.join(process.cwd(), "services/ns-control-plane/.cache/state.json");
  return {
    store: createStore(dbPath),
    dnsChecks: createDnsChecks(),
    pdns: createPdnsClient(),
    providerNs: [
      process.env.PROVIDER_NS1 || "ns1.tahoecarspa.com",
      process.env.PROVIDER_NS2 || "ns2.tahoecarspa.com"
    ]
  };
}

export function createServer(customDeps = {}) {
  const deps = { ...createDefaultDeps(), ...customDeps };

  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/healthz") {
      return sendJson(res, 200, { ok: true, service: "ns-control-plane" });
    }

    if (req.method === "POST" && url.pathname === "/v1/domains") {
      return readBody(req, (err, body) => {
        if (err) return sendJson(res, err.message === "request_too_large" ? 413 : 400, { error: err.message });
        try {
          const domain = normalizeDomain(body.domain);
          const token = createVerificationToken(domain);
          const txtName = `_tolldns-verification.${domain}`;
          const entry = deps.store.upsertDomain(domain, {
            domain,
            token,
            txt_name: txtName,
            txt_value: token,
            verified: false,
            delegated: false,
            nameservers: [],
            last_checked_at: null,
            created_at: nowIso(),
            client_hash: ipHash(req)
          });
          return sendJson(res, 200, {
            domain: entry.domain,
            ns: deps.providerNs,
            txt_name: entry.txt_name,
            txt_value: entry.txt_value,
            status: "pending_verification"
          });
        } catch (e) {
          return sendJson(res, 400, { error: String(e.message || e) });
        }
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/domains/verify") {
      return readBody(req, async (err, body) => {
        if (err) return sendJson(res, err.message === "request_too_large" ? 413 : 400, { error: err.message });
        try {
          const domain = normalizeDomain(body.domain);
          const entry = deps.store.getDomain(domain);
          if (!entry) return sendJson(res, 404, { error: "domain_not_found" });

          const txtOk = await deps.dnsChecks.checkTxt(entry.txt_name, entry.token);
          const nameservers = await deps.dnsChecks.getNameservers(domain);
          const required = deps.providerNs.map((n) => n.toLowerCase());
          const delegated = required.every((n) => nameservers.includes(n));
          const verified = Boolean(txtOk && delegated);

          if (verified) {
            await deps.pdns.ensureZone(domain, deps.providerNs);
            await deps.pdns.bumpSerial(domain);
          }

          const updated = deps.store.upsertDomain(domain, {
            verified,
            delegated,
            nameservers,
            last_checked_at: nowIso()
          });

          return sendJson(res, 200, {
            domain,
            verified: updated.verified,
            delegated: updated.delegated,
            nameservers: updated.nameservers,
            last_checked_at: updated.last_checked_at,
            status: verified ? "verified" : "pending"
          });
        } catch (e) {
          return sendJson(res, 400, { error: String(e.message || e) });
        }
      });
    }

    const statusMatch = req.method === "GET" && url.pathname.match(/^\/v1\/domains\/([^/]+)\/status$/);
    if (statusMatch) {
      try {
        const domain = normalizeDomain(decodeURIComponent(statusMatch[1]));
        const entry = deps.store.getDomain(domain);
        if (!entry) return sendJson(res, 404, { error: "domain_not_found" });
        return sendJson(res, 200, {
          domain,
          verified: Boolean(entry.verified),
          delegated: Boolean(entry.delegated),
          nameservers: entry.nameservers || [],
          last_checked_at: entry.last_checked_at
        });
      } catch (e) {
        return sendJson(res, 400, { error: String(e.message || e) });
      }
    }

    const recordsMatch = url.pathname.match(/^\/v1\/domains\/([^/]+)\/records$/);
    if (recordsMatch && req.method === "GET") {
      return (async () => {
        try {
          const domain = normalizeDomain(decodeURIComponent(recordsMatch[1]));
          const entry = deps.store.getDomain(domain);
          if (!entry?.verified) return sendJson(res, 409, { error: "domain_not_verified" });
          const records = await deps.pdns.listRecords(domain);
          return sendJson(res, 200, { domain, records });
        } catch (e) {
          return sendJson(res, 400, { error: String(e.message || e) });
        }
      })();
    }

    if (recordsMatch && req.method === "POST") {
      return readBody(req, async (err, body) => {
        if (err) return sendJson(res, err.message === "request_too_large" ? 413 : 400, { error: err.message });
        try {
          const domain = normalizeDomain(decodeURIComponent(recordsMatch[1]));
          const entry = deps.store.getDomain(domain);
          if (!entry?.verified) return sendJson(res, 409, { error: "domain_not_verified" });
          const type = String(body.type || "").toUpperCase();
          const name = String(body.name || "").trim();
          const value = String(body.value || "").trim();
          const ttl = Number(body.ttl || 300);
          if (!type || !name || !value) return sendJson(res, 400, { error: "invalid_record" });
          await deps.pdns.addRecord(domain, { type, name, value, ttl });
          return sendJson(res, 200, { ok: true, domain, type, name, ttl });
        } catch (e) {
          return sendJson(res, 400, { error: String(e.message || e) });
        }
      });
    }

    if (recordsMatch && req.method === "DELETE") {
      return readBody(req, async (err, body) => {
        if (err) return sendJson(res, err.message === "request_too_large" ? 413 : 400, { error: err.message });
        try {
          const domain = normalizeDomain(decodeURIComponent(recordsMatch[1]));
          const entry = deps.store.getDomain(domain);
          if (!entry?.verified) return sendJson(res, 409, { error: "domain_not_verified" });
          const type = String(body.type || "").toUpperCase();
          const name = String(body.name || "").trim();
          if (!type || !name) return sendJson(res, 400, { error: "invalid_record" });
          await deps.pdns.deleteRecord(domain, { type, name });
          return sendJson(res, 200, { ok: true, domain, type, name });
        } catch (e) {
          return sendJson(res, 400, { error: String(e.message || e) });
        }
      });
    }

    return sendJson(res, 404, { error: "not_found" });
  });
}

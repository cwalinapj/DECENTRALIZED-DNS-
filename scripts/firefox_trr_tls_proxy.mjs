#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const LISTEN_HOST = process.env.TLS_PROXY_HOST || "127.0.0.1";
const LISTEN_PORT = Number(process.env.TLS_PROXY_PORT || "8443");
const TARGET_BASE = process.env.TLS_PROXY_TARGET || "http://127.0.0.1:8054";
const TLS_KEY_FILE = process.env.TLS_PROXY_KEY_FILE || "";
const TLS_CERT_FILE = process.env.TLS_PROXY_CERT_FILE || "";

if (!TLS_KEY_FILE || !TLS_CERT_FILE) {
  console.error("missing_tls_files: set TLS_PROXY_KEY_FILE and TLS_PROXY_CERT_FILE");
  process.exit(2);
}

if (!fs.existsSync(TLS_KEY_FILE) || !fs.existsSync(TLS_CERT_FILE)) {
  console.error(`tls_files_not_found: key=${TLS_KEY_FILE} cert=${TLS_CERT_FILE}`);
  process.exit(2);
}

const targetUrl = new URL(TARGET_BASE);
const upstreamModule = targetUrl.protocol === "https:" ? https : http;

const server = https.createServer(
  {
    key: fs.readFileSync(TLS_KEY_FILE),
    cert: fs.readFileSync(TLS_CERT_FILE)
  },
  (req, res) => {
    const upstreamHeaders = { ...req.headers, host: targetUrl.host };
    const upstreamReq = upstreamModule.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
        method: req.method,
        path: req.url || "/",
        headers: upstreamHeaders
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );

    upstreamReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ error: "tls_proxy_upstream_error", message: String(err?.message || err) }));
    });

    req.pipe(upstreamReq);
  }
);

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `firefox_trr_tls_proxy_listening https://${LISTEN_HOST}:${LISTEN_PORT} -> ${targetUrl.toString().replace(/\/$/, "")}`
  );
});


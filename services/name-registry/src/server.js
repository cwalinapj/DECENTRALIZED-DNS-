import { createServer } from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const port = Number(process.env.PORT || 8895);

function loadRecords() {
  const file = path.join(dataDir, 'records.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
  if (!req.url) return sendJson(res, 400, { error: 'missing_url' });
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });

  if (url.pathname.startsWith('/v1/names/')) {
    const name = decodeURIComponent(url.pathname.replace('/v1/names/', '')).toLowerCase();
    const records = loadRecords();
    const record = records.find((r) => String(r.name).toLowerCase() === name);
    if (!record) return sendJson(res, 404, { error: 'not_found' });
    return sendJson(res, 200, record);
  }

  return sendJson(res, 404, { error: 'not_found' });
});

server.listen(port, () => {
  console.log('name-registry listening on :' + port);
});

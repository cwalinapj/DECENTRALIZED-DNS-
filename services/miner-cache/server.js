const { createServer } = require('node:http');
const { promises: fs } = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync, createPrivateKey, sign } = require('node:crypto');

const dataDir = process.env.DATA_DIR || '/var/lib/ddns';
const keyPath = path.join(dataDir, 'device_key');
const port = Number(process.env.PORT || 8795);

async function loadKeyMaterial() {
  try {
    const raw = await fs.readFile(keyPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
    const payload = {
      private_key: privateKeyPem,
      public_key: Buffer.from(publicKeyDer).toString('base64'),
    };
    await fs.writeFile(keyPath, JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  }
}

function isLocalAddress(remoteAddress = '') {
  const address = remoteAddress.replace(/^::ffff:/, '');
  const normalized = address.toLowerCase();
  if (normalized.includes(':')) {
    const isUniqueLocal = /^f[cd][0-9a-f]{2}:/i.test(normalized);
    const isLinkLocal = /^fe80:/i.test(normalized);
    return normalized === '::1' || isUniqueLocal || isLinkLocal;
  }
  const octets = address.split('.');
  const secondOctet = octets.length === 4 ? Number(octets[1]) : NaN;
  const isPrivate172 = octets.length === 4 && octets[0] === '172' && secondOctet >= 16 && secondOctet <= 31;
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    isPrivate172
  );
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.url === '/healthz') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.url === '/prove') {
    if (!isLocalAddress(req.socket.remoteAddress)) {
      sendJson(res, 403, { error: 'Local requests only' });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const body = await readBody(req);
    const nonce = body?.nonce;
    if (!nonce || typeof nonce !== 'string') {
      sendJson(res, 400, { error: 'Missing nonce' });
      return;
    }
    const keys = await loadKeyMaterial();
    // Ed25519 signatures use the key type; the algorithm parameter is not required.
    const signature = sign(null, Buffer.from(nonce), createPrivateKey(keys.private_key));
    sendJson(res, 200, {
      nonce,
      signature: signature.toString('base64'),
      public_key: keys.public_key,
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Miner cache listening on :${port}`);
});

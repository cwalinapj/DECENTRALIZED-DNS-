import { createServer } from 'node:http';
import { URL } from 'node:url';
import { createJobsRoutes } from './routes/jobs.js';
import { createSitesRoutes } from './routes/sites.js';
import { createPaymentsRoutes } from './routes/payments.js';
import { createMinerProofRoutes } from './routes/minerProof.js';
import type { CompatState, Route } from './types.js';

const dataDir = process.env.DATA_DIR || './data';
const adminKey = process.env.ADMIN_API_KEY || '';
const paymentAddress = process.env.PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000';

const state: CompatState = {
  dataDir,
  adminKey,
  paymentAddress,
  sites: new Map(),
  jobs: new Map(),
  walletChallenges: new Map(),
  walletSessions: new Map(),
  payments: new Map(),
};

const routes: Route[] = [
  ...createSitesRoutes(state),
  ...createJobsRoutes(state),
  ...createPaymentsRoutes(state),
  ...createMinerProofRoutes(state),
];

function sendJson(res: any, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readBody(req: any) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) {
      throw new Error('Payload too large');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Missing URL' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-ddns-compat-key',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = routes.find((candidate) =>
    candidate.method === req.method && candidate.pattern.test(url.pathname)
  );

  if (!route) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  let body: any = null;
  if (req.method === 'POST') {
    try {
      body = await readBody(req);
    } catch (error: any) {
      sendJson(res, 413, { error: error.message });
      return;
    }
  }

  const params = url.pathname.match(route.pattern);
  await route.handler({ req, res, params, body, state });
});

const port = Number(process.env.PORT || 8790);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Compat control plane listening on :${port}`);
});

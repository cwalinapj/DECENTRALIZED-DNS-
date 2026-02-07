import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { createJobsRoutes } from './routes/jobs.js';
import { createSitesRoutes } from './routes/sites.js';
import { createPaymentsRoutes } from './routes/payments.js';
import { createMinerProofRoutes } from './routes/minerProof.js';
import { createTollCommentsRoutes } from './routes/toll-comments.js';
import type { CompatState, Route } from './types.js';

const dataDir = process.env.DATA_DIR || './data';
const adminKey = process.env.ADMIN_API_KEY || '';
const allowUnauthenticated = process.env.ALLOW_UNAUTHENTICATED === '1';
const paymentAddress = process.env.PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000';
const paymentAsset = process.env.PAYMENT_ASSET || 'USDC';
const paymentAmount = process.env.PAYMENT_AMOUNT || '5.00';
const minerProofSecret = process.env.MINER_PROOF_SECRET || '';
const tollSiteToken = process.env.TOLL_SITE_TOKEN || '';
const tollRpcUrl = process.env.TOLL_RPC_URL || '';
const tollEscrowContract = process.env.TOLL_ESCROW_CONTRACT || '';
const tollOperatorKey = process.env.TOLL_OPERATOR_KEY || '';
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 2_000_000);

const state: CompatState = {
  dataDir,
  adminKey,
  allowUnauthenticated,
  paymentAddress,
  paymentAsset,
  paymentAmount,
  minerProofSecret,
  tollSiteToken,
  tollRpcUrl,
  tollEscrowContract,
  tollOperatorKey,
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
  ...createTollCommentsRoutes(state),
];

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw new Error('Payload too large');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks as Uint8Array[]).toString('utf8');
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
      'Access-Control-Allow-Headers': 'Content-Type,x-ddns-compat-key,x-ddns-site-token',
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
  if (!adminKey && !allowUnauthenticated) {
    // eslint-disable-next-line no-console
    console.warn('ADMIN_API_KEY not set. Requests will be rejected.');
  }
  if (!adminKey && allowUnauthenticated) {
    // eslint-disable-next-line no-console
    console.warn('ALLOW_UNAUTHENTICATED enabled; control plane is open.');
  }
  // eslint-disable-next-line no-console
  console.log(`Compat control plane listening on :${port}`);
});

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CompatState, Route } from '../types.js';
import { requireAdmin } from '../auth/index.js';

export function createMinerProofRoutes(state: CompatState): Route[] {
  return [
    {
      method: 'POST',
      pattern: /^\/v1\/miner-proof\/verify$/,
      handler: ({ req, res, body }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const token = body?.token as string | undefined;
        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing token' }));
          return;
        }
        if (!state.minerProofSecret) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Miner proof secret not configured' }));
          return;
        }
        const trimmed = token.startsWith('proof_') ? token.slice(6) : token;
        const [nonce, signature] = trimmed.split('.');
        if (!nonce || !signature) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid proof token' }));
          return;
        }
        const expected = createHmac('sha256', state.minerProofSecret)
          .update(nonce)
          .digest('hex');
        const signatureBuf = Buffer.from(signature, 'hex');
        const expectedBuf = Buffer.from(expected, 'hex');
        if (signatureBuf.length !== expectedBuf.length ||
          !timingSafeEqual(new Uint8Array(signatureBuf), new Uint8Array(expectedBuf))) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid proof token' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Miner proof accepted. Free credits enabled.',
          credits_granted: 3,
        }));
      },
    },
  ];
}

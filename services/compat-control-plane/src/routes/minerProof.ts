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
        if (token.length < 8) {
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

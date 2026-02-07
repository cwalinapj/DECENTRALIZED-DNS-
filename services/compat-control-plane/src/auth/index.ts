import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CompatState } from '../types.js';

export function requireAdmin(req: IncomingMessage, res: ServerResponse, state: CompatState): boolean {
  if (!state.adminKey) {
    if (state.allowUnauthenticated) {
      return true;
    }
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ADMIN_API_KEY not configured' }));
    return false;
  }
  const header = req.headers['x-ddns-compat-key'];
  if (header === state.adminKey) {
    return true;
  }
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}

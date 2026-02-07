import { randomUUID } from 'node:crypto';
import type { CompatState, Route, WalletChallenge, WalletSession } from '../types.js';
import { requireAdmin } from '../auth/index.js';

function buildChallenge(chain: string, address: string, siteId: string): WalletChallenge {
  const issuedAt = new Date().toISOString();
  const message = [
    'DDNS Compat Login',
    `Address: ${address}`,
    `Chain: ${chain}`,
    `Site: ${siteId || 'unknown'}`,
    `Nonce: ${randomUUID()}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
  return {
    chain,
    address,
    message,
    issued_at: issuedAt,
  };
}

export function createPaymentsRoutes(state: CompatState): Route[] {
  return [
    {
      method: 'POST',
      pattern: /^\/v1\/wallets\/challenge$/,
      handler: ({ req, res, body }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const chain = body?.chain;
        const address = body?.address;
        if (!chain || !address) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing wallet info' }));
          return;
        }
        const challenge = buildChallenge(chain, address, body?.site_id || '');
        state.walletChallenges.set(`${chain}:${address}`, challenge);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: challenge.message }));
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/wallets\/verify$/,
      handler: ({ req, res, body }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const chain = body?.chain;
        const address = body?.address;
        const signature = body?.signature;
        const message = body?.message;
        if (!chain || !address || !signature || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing signature payload' }));
          return;
        }
        const key = `${chain}:${address}`;
        const challenge = state.walletChallenges.get(key);
        if (!challenge || challenge.message !== message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Challenge mismatch' }));
          return;
        }
        const sessionToken = `sess_${randomUUID()}`;
        const session: WalletSession = {
          token: sessionToken,
          chain,
          address,
          issued_at: new Date().toISOString(),
        };
        state.walletSessions.set(sessionToken, session);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ session_token: sessionToken }));
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/payments\/create$/,
      handler: ({ req, res, body }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const sessionToken = body?.session_token;
        if (!sessionToken || !state.walletSessions.has(sessionToken)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid session' }));
          return;
        }
        const asset = body?.asset || state.paymentAsset;
        const amount = body?.amount || state.paymentAmount;
        const paymentId = `pay_${randomUUID()}`;
        const record = {
          id: paymentId,
          address: state.paymentAddress,
          asset,
          amount,
          status: 'pending',
          created_at: new Date().toISOString(),
        };
        state.payments.set(paymentId, record);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(record));
      },
    },
  ];
}

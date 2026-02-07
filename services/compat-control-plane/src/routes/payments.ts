import { randomUUID } from 'node:crypto';
import type { CompatState, Route, WalletChallenge, WalletSession } from '../types.js';
import { requireAdmin } from '../auth/index.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;

function buildChallenge(chain: string, address: string, siteId: string): WalletChallenge {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const message = [
    'DDNS Compat Login',
    `Address: ${address}`,
    `Chain: ${chain}`,
    `Site: ${siteId || 'unknown'}`,
    `Nonce: ${randomUUID()}`,
    `Issued At: ${issuedAt.toISOString()}`,
  ].join('\n');
  return {
    chain,
    address,
    message,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
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
        // Expire after the recorded expiration timestamp.
        if (new Date(challenge.expires_at).getTime() < Date.now()) {
          state.walletChallenges.delete(key);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Challenge expired' }));
          return;
        }
        const sessionToken = `sess_${randomUUID()}`;
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS);
        const session: WalletSession = {
          token: sessionToken,
          chain,
          address,
          issued_at: issuedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        };
        state.walletChallenges.delete(key);
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
        const session = sessionToken ? state.walletSessions.get(sessionToken) : undefined;
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid session' }));
          return;
        }
        // Expire after the recorded expiration timestamp.
        if (new Date(session.expires_at).getTime() < Date.now()) {
          state.walletSessions.delete(sessionToken);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session expired' }));
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

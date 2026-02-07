import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ethers } from 'ethers';
import type { CompatState, Route } from '../types.js';

type TollPayload = {
  comment_id?: string;
  intent_id?: string;
  wallet?: string;
  amount?: string;
  chain_id?: string;
  tx_hash?: string;
  bonus_amount?: string;
  signature?: string;
};

const ESCROW_ABI = [
  'function refund(bytes32 intentId) payable',
  'function forfeit(bytes32 intentId)',
];

function buildSignature(action: string, payload: TollPayload, token: string): string {
  const parts = [
    action,
    String(payload.comment_id ?? ''),
    String(payload.intent_id ?? ''),
    String(payload.wallet ?? ''),
    String(payload.amount ?? ''),
    String(payload.chain_id ?? ''),
    String(payload.tx_hash ?? ''),
    String(payload.bonus_amount ?? ''),
  ];
  return createHmac('sha256', token).update(parts.join('|')).digest('hex');
}

function verifySignature(action: string, payload: TollPayload, token: string): boolean {
  const signature = String(payload.signature ?? '');
  if (!signature) {
    return false;
  }
  const expected = buildSignature(action, payload, token);
  const sigBuffer = Buffer.from(signature, 'hex');
  const expBuffer = Buffer.from(expected, 'hex');
  if (sigBuffer.length !== expBuffer.length) {
    return false;
  }
  return timingSafeEqual(sigBuffer, expBuffer);
}

function requireSiteToken(req: IncomingMessage, res: ServerResponse, state: CompatState): boolean {
  if (!state.tollSiteToken) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'TOLL_SITE_TOKEN not configured' }));
    return false;
  }
  const header = req.headers['x-ddns-site-token'];
  if (header === state.tollSiteToken) {
    return true;
  }
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}

async function sendRefund(state: CompatState, intentId: string, bonusAmount: string | undefined): Promise<string> {
  if (!state.tollRpcUrl || !state.tollEscrowContract || !state.tollOperatorKey) {
    throw new Error('Relayer not configured');
  }
  if (!ethers.isAddress(state.tollEscrowContract)) {
    throw new Error('Escrow contract address invalid');
  }
  const provider = new ethers.JsonRpcProvider(state.tollRpcUrl);
  const signer = new ethers.Wallet(state.tollOperatorKey, provider);
  const contract = new ethers.Contract(state.tollEscrowContract, ESCROW_ABI, signer);
  const intentHash = ethers.id(intentId);
  const value = bonusAmount ? BigInt(bonusAmount) : 0n;
  const tx = await contract.refund(intentHash, { value });
  return tx.hash as string;
}

async function sendForfeit(state: CompatState, intentId: string): Promise<string> {
  if (!state.tollRpcUrl || !state.tollEscrowContract || !state.tollOperatorKey) {
    throw new Error('Relayer not configured');
  }
  if (!ethers.isAddress(state.tollEscrowContract)) {
    throw new Error('Escrow contract address invalid');
  }
  const provider = new ethers.JsonRpcProvider(state.tollRpcUrl);
  const signer = new ethers.Wallet(state.tollOperatorKey, provider);
  const contract = new ethers.Contract(state.tollEscrowContract, ESCROW_ABI, signer);
  const intentHash = ethers.id(intentId);
  const tx = await contract.forfeit(intentHash);
  return tx.hash as string;
}

function validatePayload(body: TollPayload | null): string | null {
  const required = ['comment_id', 'intent_id', 'wallet', 'amount', 'chain_id', 'tx_hash'];
  for (const key of required) {
    if (!body?.[key]) {
      return `Missing ${key}`;
    }
  }
  if (!ethers.isAddress(body.wallet ?? '')) {
    return 'Invalid wallet address';
  }
  return null;
}

export function createTollCommentsRoutes(state: CompatState): Route[] {
  return [
    {
      method: 'POST',
      pattern: /^\/v1\/toll-comments\/refund$/,
      handler: async ({ req, res, body }) => {
        if (!requireSiteToken(req, res, state)) {
          return;
        }
        const payload = body as TollPayload | null;
        const error = validatePayload(payload);
        if (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error }));
          return;
        }
        if (payload?.bonus_amount && !/^[0-9]+$/.test(String(payload.bonus_amount))) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bonus amount must be wei integer' }));
          return;
        }
        if (!verifySignature('refund', payload ?? {}, state.tollSiteToken)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad signature' }));
          return;
        }
        try {
          const txHash = await sendRefund(
            state,
            String(payload?.intent_id),
            payload?.bonus_amount ? String(payload.bonus_amount) : undefined
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ tx_hash: txHash }));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Refund failed';
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: message }));
        }
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/toll-comments\/forfeit$/,
      handler: async ({ req, res, body }) => {
        if (!requireSiteToken(req, res, state)) {
          return;
        }
        const payload = body as TollPayload | null;
        const error = validatePayload(payload);
        if (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error }));
          return;
        }
        if (!verifySignature('forfeit', payload ?? {}, state.tollSiteToken)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad signature' }));
          return;
        }
        try {
          const txHash = await sendForfeit(state, String(payload?.intent_id));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ tx_hash: txHash }));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Forfeit failed';
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: message }));
        }
      },
    },
  ];
}

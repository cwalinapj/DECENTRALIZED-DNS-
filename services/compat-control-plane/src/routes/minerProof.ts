import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import type { CompatState, Route } from '../types.js';
import { requireAdmin } from '../auth/index.js';

const challengeTtlMillis = Number(process.env.MINER_PROOF_CHALLENGE_TTL_MS || 5 * 60 * 1000);
const challenges = new Map<string, number>();
const HEX_PATTERN = /^[0-9a-f]+$/i;

function cleanupChallenges() {
  const now = Date.now();
  for (const [nonce, expiresAt] of challenges.entries()) {
    if (expiresAt <= now) {
      challenges.delete(nonce);
    }
  }
}

function issueChallenge() {
  cleanupChallenges();
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + challengeTtlMillis;
  challenges.set(nonce, expiresAt);
  return { nonce, expires_at: new Date(expiresAt).toISOString() };
}

function validateChallenge(nonce: string) {
  cleanupChallenges();
  const expiresAt = challenges.get(nonce);
  if (!expiresAt) {
    return false;
  }
  if (Date.now() > expiresAt) {
    challenges.delete(nonce);
    return false;
  }
  return true;
}

function parsePublicKey(value: string) {
  if (value.includes('BEGIN PUBLIC KEY')) {
    return createPublicKey(value);
  }
  return createPublicKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'spki' });
}

export function createMinerProofRoutes(state: CompatState): Route[] {
  return [
    {
      method: 'POST',
      pattern: /^\/v1\/miner-proof\/challenge$/,
      handler: ({ req, res }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const challenge = issueChallenge();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(challenge));
      },
    },
    {
      method: 'POST',
      pattern: /^\/v1\/miner-proof\/verify$/,
      handler: ({ req, res, body }) => {
        if (!requireAdmin(req, res, state)) {
          return;
        }
        const nonce = body?.nonce as string | undefined;
        const signature = body?.signature as string | undefined;
        const publicKey = body?.public_key as string | undefined;
        if (nonce && signature && publicKey) {
          if (!validateChallenge(nonce)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Challenge expired' }));
            return;
          }
          let verified = false;
          try {
            const key = parsePublicKey(publicKey);
            // Ed25519 verification does not require an explicit algorithm parameter.
            verified = verify(null, Buffer.from(nonce), key, Buffer.from(signature, 'base64'));
          } catch {
            verified = false;
          }
          if (!verified) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid signature' }));
            return;
          }
          challenges.delete(nonce);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            message: 'Miner proof accepted. Credits active.',
            credits_active: true,
            credits_granted: 3,
          }));
          return;
        }

        const token = body?.token as string | undefined;
        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing proof token' }));
          return;
        }
        if (!state.minerProofSecret) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Miner proof secret not configured' }));
          return;
        }
        const trimmed = token.startsWith('proof_') ? token.slice(6) : token;
        const [tokenNonce, tokenSignature] = trimmed.split('.');
        if (!tokenNonce || !tokenSignature || !HEX_PATTERN.test(tokenNonce) || !HEX_PATTERN.test(tokenSignature)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid proof token' }));
          return;
        }
        const expected = createHmac('sha256', state.minerProofSecret)
          .update(tokenNonce)
          .digest('hex');
        const signatureBuf = Buffer.from(tokenSignature, 'hex');
        const expectedBuf = Buffer.from(expected, 'hex');
        if (signatureBuf.length !== expectedBuf.length ||
          !timingSafeEqual(signatureBuf, expectedBuf)) {
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

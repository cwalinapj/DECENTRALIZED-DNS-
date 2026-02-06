const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { createWallet } = require('./wallet');

const createQueryCommitment = (name, type, now = Date.now()) => {
  const bucket = Math.floor(now / 60000);
  return crypto
    .createHash('sha256')
    .update(`${name}:${type}:${bucket}`)
    .digest('hex');
};

const requestJson = (url, path, payload) => {
  const client = url.protocol === 'https:' ? https : http;
  const data = JSON.stringify(payload);

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, data });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

const createStubResolver = ({ resolverUrl, wallet } = {}) => {
  if (!resolverUrl) {
    throw new Error('resolverUrl is required');
  }

  const url = new URL(resolverUrl);
  const activeWallet = wallet || createWallet();

  const resolve = async ({
    name,
    type = 'A',
    clientRegion,
    needsGateway = false,
    needsCache = false,
    amount = 0.001,
    expiryMs = 30000,
  }) => {
    const queryCommitment = createQueryCommitment(name, type);
    const voucher = activeWallet.createVoucher({
      resolverId: url.hostname,
      amount,
      expiry: Date.now() + expiryMs,
      queryCommitment,
    });

    const response = await requestJson(url, '/v1/resolve', {
      voucher,
      query: {
        name,
        type,
        clientRegion,
        needsGateway,
        needsCache,
      },
    });

    return response;
  };

  return {
    resolve,
    wallet: activeWallet,
  };
};

module.exports = { createStubResolver, createQueryCommitment };

const http = require('http');
const { config } = require('./config');
const { createMinerRegistry } = require('./minerRegistry');
const { createVoucherLedger } = require('./voucherLedger');
const { validateVoucherFields } = require('../shared/voucher');

const registry = createMinerRegistry(config.miners);
const ledger = createVoucherLedger();

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('payload exceeds 1MB limit'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });

const respondJson = (res, status, payload) => {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
};

const resolveRequest = (body) => {
  const voucher = body.voucher;
  const validation = validateVoucherFields(voucher);
  if (!validation.ok) {
    return { status: 402, payload: { ok: false, reason: validation.reason } };
  }

  const sequenceCheck = ledger.verifySequence(voucher);
  if (!sequenceCheck.ok) {
    return { status: 409, payload: { ok: false, reason: sequenceCheck.reason } };
  }

  ledger.recordVoucher(voucher);

  const query = body.query || {};
  const capability = query.needsGateway
    ? 'gateway'
    : query.needsCache
      ? 'cache'
      : null;
  const region = query.clientRegion || config.defaultRegion;

  const miner = registry.selectMiner({
    region,
    capability,
    excludedProviders: query.excludedProviders || [],
  });

  const route = miner
    ? {
        type: 'miner',
        minerId: miner.id,
        region: miner.region,
        capability,
      }
    : {
        type: 'upstream',
        resolvers: config.upstreamResolvers,
      };

  return {
    status: 200,
    payload: {
      ok: true,
      route,
      resolverId: config.resolverId,
    },
  };
};

const settleVouchers = (body) => {
  const vouchers = Array.isArray(body.vouchers) ? body.vouchers : [];
  const total = vouchers.reduce((sum, voucher) => sum + (voucher.amount || 0), 0);
  return {
    status: 200,
    payload: {
      ok: true,
      voucherCount: vouchers.length,
      total,
      settlementWindowMs: config.settlementWindowMs,
    },
  };
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      respondJson(res, 200, {
        ok: true,
        resolverId: config.resolverId,
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/miners') {
      respondJson(res, 200, {
        ok: true,
        miners: registry.listMiners(),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/resolve') {
      const body = await readJsonBody(req);
      const response = resolveRequest(body);
      respondJson(res, response.status, response.payload);
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/settle') {
      const body = await readJsonBody(req);
      const response = settleVouchers(body);
      respondJson(res, response.status, response.payload);
      return;
    }

    respondJson(res, 404, { ok: false, reason: 'not found' });
  } catch (error) {
    respondJson(res, 500, { ok: false, reason: 'internal server error' });
  }
});

const start = () => {
  server.listen(config.port, () => {
    console.log(`Resolver listening on http://localhost:${config.port}`);
  });
};

if (require.main === module) {
  start();
}

module.exports = { start, resolveRequest };

const http = require('http');
const { config } = require('./config');
const { createMinerRegistry } = require('./minerRegistry');
const { createVoucherLedger } = require('./voucherLedger');
const { validateVoucherFields } = require('../shared/voucher');

const registry = createMinerRegistry(config.miners);
const ledger = createVoucherLedger();
const MAX_BODY_SIZE_BYTES = 1e6;

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) {
        return;
      }

      body += chunk;
      if (body.length > MAX_BODY_SIZE_BYTES) {
        aborted = true;
        req.destroy();
        reject(new Error('payload exceeds 1MB limit'));
      }
    });
    req.on('end', () => {
      if (aborted) {
        return;
      }

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
  if (!voucher) {
    return { status: 400, payload: { ok: false, reason: 'missing voucher' } };
  }

  const validation = validateVoucherFields(voucher);
  if (!validation.ok) {
    return { status: 402, payload: { ok: false, reason: validation.reason } };
  }

  const sequenceCheck = ledger.verifySequence(voucher);
  if (!sequenceCheck.ok) {
    return { status: 409, payload: { ok: false, reason: sequenceCheck.reason } };
  }

  ledger.recordVoucher(voucher);

  const query = body.query ?? {};
  let capability = null;
  if (query.needsGateway) {
    capability = 'gateway';
  } else if (query.needsCache) {
    capability = 'cache';
  }
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
    console.error('Resolver error', req.method, req.url, error);
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

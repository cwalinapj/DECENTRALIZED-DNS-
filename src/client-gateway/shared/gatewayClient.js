const { createStubResolver } = require('../../client-stub/stubResolver');

const createGatewayClient = ({ resolverUrl, clientRegion } = {}) => {
  const stub = createStubResolver({ resolverUrl });

  const resolve = ({
    queryName,
    type = 'A',
    needsGateway = false,
    needsCache = false,
  }) =>
    stub.resolve({
      name: queryName,
      type,
      clientRegion,
      needsGateway,
      needsCache,
    });

  return {
    resolve,
    stub,
  };
};

module.exports = { createGatewayClient };

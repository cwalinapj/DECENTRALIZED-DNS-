const { createStubResolver } = require('../../client-stub/stubResolver');

const createGatewayClient = ({ resolverUrl, clientRegion } = {}) => {
  const stub = createStubResolver({ resolverUrl });

  const resolve = ({
    name,
    type = 'A',
    needsGateway = false,
    needsCache = false,
  }) =>
    stub.resolve({
      name,
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

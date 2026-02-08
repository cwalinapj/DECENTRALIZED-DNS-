adapters/
  web3-name-gateway/
    README.md
    ens/
      gateway/        # ENS queries (owner/resolver)
      verifier/        # wallet proof + ownership validation
    sns/
      gateway/        # .sol queries (name registry ownership)
      verifier/
    mapper/
      routeset/        # convert ENS/SNS records -> RouteSetV1
      gatewayroutes/   # optional: generate GatewayRoutesV1 for subdomain routing

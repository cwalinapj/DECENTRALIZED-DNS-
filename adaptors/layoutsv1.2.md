adaptors/
  web3-name-gateway/
    README.md
    ens/
      resolver/        # ENS queries (owner/resolver)
      verifier/        # wallet proof + ownership validation
    sns/
      resolver/        # .sol queries (name registry ownership)
      verifier/
    mapper/
      routeset/        # convert ENS/SNS records -> RouteSetV1
      gatewayroutes/   # optional: generate GatewayRoutesV1 for subdomain routing

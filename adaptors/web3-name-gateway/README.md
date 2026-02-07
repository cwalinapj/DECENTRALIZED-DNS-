# web3-name-gateway adaptor

This adaptor lets users route **ENS (.eth)** and **SNS (.sol)** names through DECENTRALIZED-DNS by:

1) verifying wallet ownership of the Web3 name  
2) mapping Web3 name records to DECENTRALIZED-DNS native formats (`RouteSetV1`, optionally `GatewayRoutesV1`)  
3) publishing updates into the decentralized network and (optionally) updating chain commitments

> IPFS is **anchor-only**: by default we store/publish `AnchorV1` objects on IPFS for redundancy, not full RouteSets.

---

## Directory Layout

adaptors/web3-name-gateway/
README.md

ens/
resolver/      # ENS reads (owner, resolver, text records, addr records, etc.)
verifier/      # wallet proof + ENS ownership validation
sns/
resolver/      # .sol reads (name registry owner, records if available)
verifier/      # wallet proof + SNS ownership validation

mapper/
routeset/      # convert ENS/SNS records -> RouteSetV1
gatewayroutes/ # optional: generate GatewayRoutesV1 for subdomain routing

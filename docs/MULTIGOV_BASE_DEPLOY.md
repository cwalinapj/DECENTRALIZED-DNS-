# Base Hub Deployment (Foundry)

## Prereqs
- Foundry installed
- OpenZeppelin installed:
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/contracts
forge install OpenZeppelin/openzeppelin-contracts
```

## Config
Copy example env:
```bash
cp /Users/root1/scripts/DECENTRALIZED-DNS-/contracts/scripts/base.env.example /tmp/base.env
```

Edit `/tmp/base.env` with the real values.

## Deploy (Base)
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/contracts
set -a && source /tmp/base.env && set +a

forge script scripts/DeployGovernance.s.sol:DeployGovernance \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_KEY \
  --broadcast
```

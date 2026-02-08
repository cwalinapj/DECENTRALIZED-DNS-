# Adaptors

This directory contains adapters for upstream networks, naming systems, and content networks.

## Token Swap (Custodial OTC)
- Partners can onboard clients via custodial OTC swaps.
- Payment -> swap -> credit issuance -> routing enablement.
- Settlement assets: native token or stable (USDC).

## Partner Growth
Adapters can drive adoption by routing DDNS traffic for client workloads and
participating in the OTC pipeline.

## Adapter Interface
All adapters must conform to `adaptors/ADAPTER_INTERFACE.md`.

## Tests
```bash
cd /Users/root1/dev/web3-repos/DECENTRALIZED-DNS-/adaptors
npm install
npm test
```

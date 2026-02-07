# Client Apps

This repo provides wallet-based clients for mobile, desktop, browser extensions, gateways, and swarm.

## Modules
- apps/mobile: React Native (iOS first, Android supported)
- apps/desktop: macOS/Windows/Linux
- apps/browser: Chrome/Firefox/Safari/Edge extensions
- core: wallet SDK, vault, session tokens, key choice flow
- gateways: DNS enforcer, edge proxy, toll gate
- swarm: optional outbound tunnel to edge
- storage: opt-in compute/storage agent with resource caps

## Key Storage
- User chooses device-only or encrypted cloud backup.

## Pricing
- Mobile cloud storage uses IPFS at 30% of Apple storage pricing.

## Tests
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/client
npm install
npm test
```

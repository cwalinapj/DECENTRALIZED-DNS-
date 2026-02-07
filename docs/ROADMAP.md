# Roadmap (MVP)

## MVP goals
- Name gateway `/resolve` API (done)
- Voucher + escrow integration (next)
- Basic caching + timeouts (done for gateway)

## Good first issues
1. Add internal mapping backend for `.dns` names
2. Add JSON schema validation for `/resolve` output
3. Add simple CLI client to query `/resolve`
4. Add request logging with rate-limited errors
5. Add integration test for `/resolve` using a local stub DoH response

# Tollbooth (Solana MVP)

Centralized MVP service that (1) mints a Passport/TollPass for a wallet and (2) writes per-wallet route records on Solana devnet.

## Env
- `PORT` (default 8788)
- `SOLANA_RPC_URL` (default https://api.devnet.solana.com)
- `DDNS_PROGRAM_ID` (default devnet program id)
- `DDNS_IDL_PATH` (default ../../solana/target/idl/ddns_anchor.json)
- `TOLLBOOTH_KEYPAIR` (default ~/.config/solana/id.json)

## Auth (MVP)
All POST requests require a signed challenge.

1) `GET /v1/challenge?wallet=<pubkey>` => `{ nonce, expires_at }`
2) Client signs the UTF-8 bytes of `DDNS_CHALLENGE:<wallet>:<nonce>` using `signMessage`.
3) POST includes `{ wallet_pubkey, nonce, signature }`.

## Endpoints
- `GET /v1/challenge?wallet=<pubkey>`
- `POST /v1/claim-passport`
- `POST /v1/assign-route`
- `GET /v1/resolve?name=<example.dns>&wallet=<pubkey>`

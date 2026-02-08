# Vault Service (Scaffold)

Minimal vault storage API for encrypted wallet secrets.
This service **does not** encrypt data. Clients must encrypt before sending.

## Run (HTTP)
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/vault
npm install
npm run build
PORT=8891 VAULT_DIR=./data ALLOW_UNAUTHENTICATED=1 npm start
```

## Run (gRPC)
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/vault
npm install
npm run build
GRPC_PORT=8892 VAULT_DIR=./data ALLOW_UNAUTHENTICATED=1 npm run start-grpc
```

## Environment
- `PORT=8891`
- `GRPC_PORT=8892`
- `VAULT_DIR=./data`
- `ALLOW_UNAUTHENTICATED=0|1`
- `VAULT_AUTH_TOKEN=change-me`
- `MAX_BODY_BYTES=1000000`

## HTTP API
`POST /vault/entry`
```json
{
  "wallet_id": "wallet-1",
  "entry_id": "api-key-1",
  "type": "api_key",
  "ciphertext": "base64-or-hex",
  "key_id": "k1",
  "metadata": {
    "label": "primary"
  }
}
```

`POST /vault/rotate`
```json
{
  "wallet_id": "wallet-1",
  "entry_id": "api-key-1",
  "ciphertext": "new-base64",
  "key_id": "k2",
  "metadata": {
    "rotated_at": "2026-02-07T00:00:00Z"
  }
}
```

`GET /vault/entry/:wallet_id/:entry_id`

## Auth
Set `ALLOW_UNAUTHENTICATED=0` and pass `x-ddns-vault-token`.
Token validation is a TODO and should be backed by wallet signatures or mTLS.

## gRPC
Proto file lives in `proto/vault.proto`.
The gRPC server is wired for Store/Rotate/Get + Health.

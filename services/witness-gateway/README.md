# witness-gateway (MVP)

Minimal HTTP gateway that emits **privacy-safe WitnessReceiptV1** receipts for DNS answers.

Hard privacy rule: this service does **not** log client IPs and does not include any client identifiers in receipts.

## Run (local)

```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/witness-gateway
npm install
```

Create or reuse a Solana keypair for the gateway witness signer:

```bash
solana-keygen new --outfile /tmp/ddns-gateway.json --no-bip39-passphrase
```

Start the server:

```bash
export GATEWAY_KEYPAIR=/tmp/ddns-gateway.json
export DDNS_ROUTES_JSON='{"example.dns":"https://example.com"}'
npm run dev
```

Resolve:

```bash
curl "http://127.0.0.1:8788/v1/resolve?name=example.dns"
```

Flush receipts to a batch:

```bash
curl -X POST "http://127.0.0.1:8788/v1/flush"
```

## Receipt spec

See `/Users/root1/scripts/DECENTRALIZED-DNS-/docs/PROTOCOL_WITNESS_RECEIPT.md`.


# Voucher + Escrow (MVP)

## Scope
MVP supports gated namespaces (default: `*.premium`) that require a voucher header on `/resolve`.
Voucher verification defaults to stubbed mode with a clear `VOUCHER_NOT_IMPLEMENTED` error until wired to escrow/settlement.

## Gated namespace behavior
- If the name ends with a gated suffix (default `.premium`), resolver requires `x-ddns-voucher`.
- Missing voucher: `402` with `VOUCHER_REQUIRED`.
- Stub mode (default): `501` with `VOUCHER_NOT_IMPLEMENTED`.
- Memory mode: HMAC verification using `VOUCHER_SECRET`.

## Environment
- `GATED_SUFFIXES` (default `.premium`, comma-separated)
- `VOUCHER_MODE` (`stub` or `memory`)
- `VOUCHER_SECRET` (required when `VOUCHER_MODE=memory`)

## Example (stub mode)
```bash
curl "http://localhost:8054/resolve?name=example.premium"
```
Expected error:
```json
{ "error": { "code": "VOUCHER_REQUIRED", "message": "voucher required", "retryable": true } }
```

## Example (memory mode)
Start resolver:
```bash
VOUCHER_MODE=memory VOUCHER_SECRET=devsecret ./scripts/dev.sh
```
Voucher payload:
```json
{
  "user": "user_1",
  "nonce": "1",
  "scope": { "max_amount": "100", "exp": 4070908800 }
}
```
Generate signature (HMAC-SHA256 on JSON payload):
```bash
python3 - <<"PY"
import hmac, hashlib, json
secret = b"devsecret"
payload = {
  "user": "user_1",
  "nonce": "1",
  "scope": { "max_amount": "100", "exp": 4070908800 }
}
body = json.dumps(payload, separators=(",", ":"))
print(hmac.new(secret, body.encode(), hashlib.sha256).hexdigest())
PY
```
Send request:
```bash
curl -H x-ddns-voucher:
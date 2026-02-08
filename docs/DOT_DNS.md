# .DNS (Origin Namespace)

## Overview
`.dns` is an internal namespace resolved from the registry snapshot, not ICANN. It is branded as “.DNS (Origin namespace)” to avoid confusion with generic DNS.

## Resolution behavior
- `.dns` names are resolved only from the registry.
- Supported records (MVP): TXT, A, AAAA, CNAME.
- Responses can include Merkle proofs when `proof=1`.

## Enabling
```bash
REGISTRY_ENABLED=1 ./scripts/dev.sh
```

If disabled, `.dns` requests return `REGISTRY_DISABLED`.

## Query
```bash
curl "http://localhost:8054/resolve?name=alice.dns"
```

Proof:
```bash
curl "http://localhost:8054/resolve?name=alice.dns&proof=1"
```

## Updates (wallet-signed)
Updates require an Ed25519 signature from the record owner.

Set a record:
```bash
node scripts/dns-set-record.mjs \
  --name alice.dns \
  --type TXT \
  --value ipfs://example \
  --ttl 300 \
  --owner <PUBKEY_HEX> \
  --sig <SIGNATURE_HEX>
```

Delete a record:
```bash
node scripts/dns-delete-record.mjs \
  --name alice.dns \
  --owner <PUBKEY_HEX> \
  --sig <SIGNATURE_HEX>
```

## Signature payloads
- Update: `registry_update\n<canonical-json>`
- Delete: `registry_delete\n<normalized-name>\n<updatedAt>`

See `scripts/registry-utils.mjs` for canonicalization details.

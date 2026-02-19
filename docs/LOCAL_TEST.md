# Local Resolver Test

Use this to verify local gateway behavior on your machine.

## 1) Build and run gateway

```bash
npm -C gateway ci
npm -C gateway run build
PORT=8054 npm -C gateway run start
```

## 2) Query ICANN + `.dns`

In another terminal:

```bash
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
```

## 3) Expected behavior

- `netflix.com` uses recursive upstream logic and returns confidence/audit cache fields.
- `example.dns` stays on `.dns`/PKDNS path.
- This test does not modify on-chain state.

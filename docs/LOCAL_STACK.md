# Local Stack (Gateway + TLS DoH)

Use this to run a local TollDNS stack for Firefox TRR testing and real browsing.

## 1) Baseline checks

```bash
npm ci && npm test
```

## 2) Start the local stack

```bash
npm run local:stack
```

What this does:
- starts gateway on `127.0.0.1:8054`
- starts local TLS proxy on `127.0.0.1:8443`
- prints Firefox `about:config` TRR values
- runs verifier for `netflix.com` A + AAAA
- prints `✅ LOCAL STACK READY` when done

## 3) Browse test in Firefox

After the script prints ready:
- open `about:config`
- set the TRR values shown by the script
- open `https://netflix.com`

To stop the stack, press `Ctrl+C` in the terminal running `npm run local:stack`.

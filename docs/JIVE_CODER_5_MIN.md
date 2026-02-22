# Jive Coder: 5-Minute Setup

No jargon. No special accounts. Just a local DNS stack you can browse through in under 5 minutes.

## What you get

- A local DNS gateway running on your machine
- Firefox routing its DNS lookups through it
- Any website you open resolves through your own local stack

## Step 1 — Start the local stack

```bash
npm run local:stack
```

This one command:

- starts the gateway on `127.0.0.1:8054`
- starts a local TLS proxy on `127.0.0.1:8443`
- prints the Firefox settings you need to paste
- runs a quick verify for `netflix.com` and prints `✅ LOCAL STACK READY`

Keep this terminal open.

## Step 2 — Configure Firefox (30 seconds)

1. Open a new Firefox tab and go to `about:config`
2. Accept the warning
3. Copy/paste each setting the script printed — they look like:

   | Preference | Value |
   |---|---|
   | `network.trr.mode` | `3` |
   | `network.trr.uri` | `https://127.0.0.1:8443/dns-query` |
   | `network.trr.custom_uri` | `https://127.0.0.1:8443/dns-query` |
   | `network.trr.allow-rfc1918` | `true` |
   | `network.trr.bootstrapAddr` | `127.0.0.1` |

## Step 3 — Browse

Open Firefox → browse `https://netflix.com`

Firefox is now resolving DNS through your local gateway. The site loads normally; DNS just went through your stack first.

## Try resolving any domain via local gateway

Open a second terminal and run:

```bash
curl 'http://127.0.0.1:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://127.0.0.1:8054/v1/resolve?name=github.com&type=A'
curl 'http://127.0.0.1:8054/v1/resolve?name=example.com&type=A'
```

You get back a JSON object with the answers, cache confidence, and upstream audit info.

## Stop the stack

Press `Ctrl+C` in the terminal running `npm run local:stack`.

## Want to try the public demo instead?

No local install needed. See: [`docs/PUBLIC_DEMO.md`](./PUBLIC_DEMO.md)

## Help the network (optional)

If you want to run a node and contribute to the network:
[`docs/MINER_QUICKSTART_CF.md`](./MINER_QUICKSTART_CF.md)

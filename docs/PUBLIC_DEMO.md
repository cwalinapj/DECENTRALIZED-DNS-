# Public Demo (Cloudflare Resolver + Share UI)

This doc shows how to run and share the public Cloudflare demo gateway.

Important:
- Wrangler cannot create Cloudflare accounts or bypass CAPTCHA/email verification.
- Run `wrangler login` once in the browser, then deploy is repeatable from CLI.
- Do not commit any Cloudflare API token.

## 1) Local preview

```bash
npm -C services/cf-demo-gateway i
npm run demo:cf:dev
```

Then open:
- UI: <http://127.0.0.1:8788/>
- API: <http://127.0.0.1:8788/v1/resolve?name=netflix.com&type=A>

Expected API shape includes:
- `answers`
- `confidence`
- `rrset_hash`
- `upstreams_used`

## 2) Deploy public share endpoint

Interactive deploy (recommended):

```bash
npm run demo:cf:deploy
```

If not logged in yet, run once first:

```bash
cd services/cf-demo-gateway
npx wrangler login
```

After deploy, use the URL Wrangler prints:
- UI: `https://<your-worker>.workers.dev/`
- API: `https://<your-worker>.workers.dev/v1/resolve?name=netflix.com&type=A`

## 3) Share link behavior

The UI supports query-encoded share links:

```text
https://<your-worker>.workers.dev/?name=netflix.com&type=A
```

Anyone opening the link can re-run resolve and see live:
- answers
- confidence
- rrset hash
- upstream audit entries

## 4) Quick curl verify

```bash
curl 'https://<your-worker>.workers.dev/healthz'
curl 'https://<your-worker>.workers.dev/v1/resolve?name=netflix.com&type=A'
```

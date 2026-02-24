# SEO Oracle Local Run (MVP scaffold)

```bash
npm -C services/seo-oracle install
npm -C services/seo-oracle test
PORT=8094 npm -C services/seo-oracle start
```

Try endpoints:

```bash
curl -sS 'http://127.0.0.1:8094/healthz'
curl -sS 'http://127.0.0.1:8094/v1/site/audit?domain=example.com'
curl -sS 'http://127.0.0.1:8094/v1/check?domain=example.com'
```

Gateway compatibility wiring:

```bash
DOMAIN_EXPIRY_WORKER_URL='http://127.0.0.1:8094/v1/check' PORT=8054 npm -C gateway run start
```

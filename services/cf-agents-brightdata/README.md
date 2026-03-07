# Cloudflare Agents + Bright Data MCP

Cloudflare Worker service that hosts a Durable Object chat agent and connects it to Bright Data's hosted MCP server.

## What it does

- Uses the Cloudflare `agents` SDK and `@cloudflare/ai-chat`
- Connects to Bright Data MCP before requesting MCP tools
- Uses Workers AI for the chat model by default
- Exposes `GET /healthz` for runtime checks

## Local dev

```bash
cd /Users/root1/DECENTRALIZED-DNS-/services/cf-agents-brightdata
npm install
cp .dev.vars.example .dev.vars
```

Set your Bright Data API token in `.dev.vars`:

```env
BRIGHT_DATA_API_TOKEN=2dceb1aa0...
```

Start locally:

```bash
npm run dev
```

Check health:

```bash
curl http://127.0.0.1:8787/healthz
```

## Deploy

```bash
npx wrangler login
npm run deploy
```

## Important integration detail

The worker connects to Bright Data MCP before calling `this.mcp.getAITools()`. That avoids the MCP schema initialization error called out in Bright Data's integration docs.

# Cloudflare Agents Bright Data MCP Service

The repo now includes a Cloudflare Agents service at `services/cf-agents-brightdata`.

## Runtime shape

- Durable Object chat agent via `agents` + `@cloudflare/ai-chat`
- Bright Data hosted MCP connection using:
  - `https://mcp.brightdata.com/mcp?token=<API_TOKEN>`
- Workers AI model binding for generation

## Files

- `services/cf-agents-brightdata/src/server.ts`
- `services/cf-agents-brightdata/src/config.ts`
- `services/cf-agents-brightdata/wrangler.toml`
- `services/cf-agents-brightdata/README.md`

## Validation

- Service-local config tests run with `npm test`
- Worker build runs with `npm run build`

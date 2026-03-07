import { routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { convertToModelMessages, streamText, stepCountIs } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { buildBrightDataMcpUrl, redactSecret, resolveAiModel } from "./config.js";

export interface Env {
  AI: unknown;
  BRIGHTDATA_AGENT: unknown;
  BRIGHT_DATA_API_TOKEN?: string;
  AI_MODEL?: string;
  SYSTEM_PROMPT?: string;
}

type AgentState = {
  brightDataConnected: boolean;
  brightDataConnectedAt: number | null;
};

const HOME_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cloudflare Agents + Bright Data MCP</title>
  <style>
    :root {
      --bg: #eef4f0;
      --card: #fbfcf7;
      --ink: #163126;
      --muted: #5b6f63;
      --accent: #1f7a4c;
      --line: #c8d6cd;
    }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(31, 122, 76, 0.15), transparent 32%),
        radial-gradient(circle at right, rgba(15, 74, 138, 0.12), transparent 28%),
        var(--bg);
      min-height: 100vh;
    }
    main {
      max-width: 880px;
      margin: 0 auto;
      padding: 36px 20px 48px;
    }
    .card {
      background: rgba(251, 252, 247, 0.92);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: 0 18px 50px rgba(22, 49, 38, 0.08);
      padding: 22px;
      margin-top: 18px;
      backdrop-filter: blur(6px);
    }
    h1, h2 {
      margin: 0 0 10px;
      font-family: "IBM Plex Serif", Georgia, serif;
    }
    p, li {
      line-height: 1.55;
      color: var(--muted);
    }
    code, pre {
      font-family: "IBM Plex Mono", monospace;
      font-size: 0.93rem;
    }
    pre {
      background: #f1f6f2;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      overflow: auto;
    }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <h1>Cloudflare Agents + Bright Data MCP</h1>
    <p>This worker hosts a Durable Object chat agent wired to Bright Data's hosted MCP server. Set <code>BRIGHT_DATA_API_TOKEN</code>, run <code>npm run dev</code>, then connect a chat client to the agent routes handled by the Agents SDK.</p>
    <div class="card">
      <h2>Health</h2>
      <p>Check <code>/healthz</code> for runtime configuration status.</p>
    </div>
    <div class="card">
      <h2>Setup</h2>
      <pre>cd services/cf-agents-brightdata
npm install
cp .dev.vars.example .dev.vars
npm run dev</pre>
    </div>
    <div class="card">
      <h2>Notes</h2>
      <ul>
        <li>Bright Data MCP is connected before MCP tools are requested.</li>
        <li>The default model uses the Workers AI binding, not an external OpenAI key.</li>
        <li>Agent request routing is handled by <code>routeAgentRequest()</code>.</li>
      </ul>
    </div>
  </main>
</body>
</html>`;

export class BrightDataChatAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = {
    brightDataConnected: false,
    brightDataConnectedAt: null
  };
  waitForMcpConnections = true;

  private mcpConnectionPromise: Promise<void> | null = null;

  private get workerEnv(): Env {
    return (this as unknown as { env: Env }).env;
  }

  private async ensureBrightDataConnected(): Promise<void> {
    if (this.state.brightDataConnected) {
      return;
    }
    if (!this.mcpConnectionPromise) {
      this.mcpConnectionPromise = (async () => {
        const token = String(this.workerEnv.BRIGHT_DATA_API_TOKEN || "").trim();
        if (!token) {
          throw new Error("BRIGHT_DATA_API_TOKEN is not configured.");
        }
        await this.mcp.connect(buildBrightDataMcpUrl(token));
        this.setState({
          brightDataConnected: true,
          brightDataConnectedAt: Date.now()
        });
      })().finally(() => {
        this.mcpConnectionPromise = null;
      });
    }
    await this.mcpConnectionPromise;
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions): Promise<Response> {
    await this.ensureBrightDataConnected();
    const workersAI = createWorkersAI({ binding: this.workerEnv.AI as any });
    const result = streamText({
      model: workersAI(resolveAiModel(this.workerEnv.AI_MODEL)),
      system:
        String(this.workerEnv.SYSTEM_PROMPT || "").trim() ||
        "You are a web research agent. Use Bright Data MCP tools when fresh web evidence is required and cite source URLs.",
      messages: await convertToModelMessages(this.messages),
      tools: {
        ...this.mcp.getAITools()
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });
    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(HOME_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    if (url.pathname === "/healthz") {
      return Response.json({
        ok: true,
        service: "cf-agents-brightdata",
        bright_data_token_configured: Boolean(String(env.BRIGHT_DATA_API_TOKEN || "").trim()),
        bright_data_token_preview: redactSecret(env.BRIGHT_DATA_API_TOKEN),
        ai_model: resolveAiModel(env.AI_MODEL)
      });
    }

    const routed = await routeAgentRequest(request, env);
    if (routed) {
      return routed;
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }
};

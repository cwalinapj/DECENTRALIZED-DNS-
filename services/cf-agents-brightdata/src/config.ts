export const DEFAULT_AI_MODEL = "@cf/zai-org/glm-4.7-flash";

export function resolveAiModel(input: string | undefined): string {
  const value = String(input || "").trim();
  return value || DEFAULT_AI_MODEL;
}

export function buildBrightDataMcpUrl(token: string): string {
  const clean = String(token || "").trim();
  if (!clean) {
    throw new Error("BRIGHT_DATA_API_TOKEN is required.");
  }
  const url = new URL("https://mcp.brightdata.com/mcp");
  url.searchParams.set("token", clean);
  return url.toString();
}

export function redactSecret(secret: string | undefined): string | null {
  const value = String(secret || "").trim();
  if (!value) {
    return null;
  }
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

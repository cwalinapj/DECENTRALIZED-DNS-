import test from "node:test";
import assert from "node:assert/strict";
import { buildBrightDataMcpUrl, redactSecret, resolveAiModel } from "../src/config.js";

test("buildBrightDataMcpUrl encodes the token in the hosted MCP URL", () => {
  const url = buildBrightDataMcpUrl("abc123");
  assert.equal(url, "https://mcp.brightdata.com/mcp?token=abc123");
});

test("buildBrightDataMcpUrl rejects an empty token", () => {
  assert.throws(() => buildBrightDataMcpUrl("   "), /BRIGHT_DATA_API_TOKEN/);
});

test("resolveAiModel falls back to the default workers ai model", () => {
  assert.equal(resolveAiModel(""), "@cf/zai-org/glm-4.7-flash");
  assert.equal(resolveAiModel("  custom-model  "), "custom-model");
});

test("redactSecret keeps only the edge characters", () => {
  assert.equal(redactSecret("2dceb1aa0123456789"), "2dce...6789");
  assert.equal(redactSecret(""), null);
});

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseProgramsFromAnchorToml } from "./anchor_programs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const anchorTomlPath = path.resolve(__dirname, "../../Anchor.toml");

test("parseProgramsFromAnchorToml parses localnet entries", () => {
  const programs = parseProgramsFromAnchorToml(anchorTomlPath, "localnet");
  assert.ok(programs.length > 5);
  const names = new Set(programs.map((p) => p.name));
  assert.ok(names.has("ddns_anchor"));
  assert.ok(names.has("ddns_registry"));
  assert.ok(names.has("ddns_witness_rewards"));
});

test("parseProgramsFromAnchorToml parses devnet entries", () => {
  const programs = parseProgramsFromAnchorToml(anchorTomlPath, "devnet");
  assert.ok(programs.length > 5);
  const names = new Set(programs.map((p) => p.name));
  assert.ok(names.has("ddns_anchor"));
  assert.ok(names.has("ddns_registry"));
  assert.ok(names.has("ddns_witness_rewards"));
});

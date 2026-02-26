#!/usr/bin/env tsx
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { parseProgramsFromAnchorToml } from "./lib/anchor_programs";

const argv = await yargs(hideBin(process.argv))
  .option("section", {
    type: "string",
    choices: ["localnet", "devnet"] as const,
    default: "localnet"
  })
  .option("format", {
    type: "string",
    choices: ["json", "table"] as const,
    default: "table"
  })
  .strict()
  .parse();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const anchorTomlPath = path.resolve(__dirname, "../Anchor.toml");
const programs = parseProgramsFromAnchorToml(anchorTomlPath, argv.section);
const programsDir = path.resolve(__dirname, "../programs");
const diskPrograms = fs
  .readdirSync(programsDir, { withFileTypes: true })
  .filter((ent) => ent.isDirectory())
  .map((ent) => ent.name)
  .sort();

const inAnchor = new Set(programs.map((p) => p.name));
const inDisk = new Set(diskPrograms);
const missingInAnchor = diskPrograms.filter((name) => !inAnchor.has(name));
const missingOnDisk = programs.map((p) => p.name).filter((name) => !inDisk.has(name));

if (missingInAnchor.length || missingOnDisk.length) {
  throw new Error(
    `Anchor/programs mismatch: missing_in_anchor=[${missingInAnchor.join(", ")}] missing_on_disk=[${missingOnDisk.join(", ")}]`
  );
}

if (argv.format === "json") {
  console.log(
    JSON.stringify(
      {
        section: argv.section,
        programs,
        coverage: {
          anchor_count: programs.length,
          programs_dir_count: diskPrograms.length
        }
      },
      null,
      2
    )
  );
  process.exit(0);
}

console.log(`section: programs.${argv.section}`);
console.log("program_count:", programs.length);
console.log("programs_dir_count:", diskPrograms.length);
console.log("");
console.log("| name | program_id |");
console.log("| --- | --- |");
for (const entry of programs) {
  console.log(`| ${entry.name} | ${entry.programId} |`);
}

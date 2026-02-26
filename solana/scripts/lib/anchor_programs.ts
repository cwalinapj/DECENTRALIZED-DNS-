import fs from "node:fs";

export type ProgramEntry = {
  name: string;
  programId: string;
};

export function parseProgramsFromAnchorToml(
  anchorTomlPath: string,
  section: "localnet" | "devnet"
): ProgramEntry[] {
  const text = fs.readFileSync(anchorTomlPath, "utf8");
  const lines = text.split(/\r?\n/);
  const sectionHeader = `[programs.${section}]`;
  const out: ProgramEntry[] = [];
  let inSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) {
      inSection = line === sectionHeader;
      continue;
    }
    if (!inSection) continue;

    const m = /^([a-zA-Z0-9_]+)\s*=\s*"([^"]+)"\s*$/.exec(line);
    if (!m) continue;
    out.push({ name: m[1], programId: m[2] });
  }

  if (out.length === 0) {
    throw new Error(`No entries found in section ${sectionHeader}`);
  }
  return out;
}

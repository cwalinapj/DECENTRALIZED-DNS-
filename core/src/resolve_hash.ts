import { hash as blake3 } from "blake3";
import type { ResolveResponse } from "./resolve_schema.js";

export type ResolveHashInput = Pick<ResolveResponse, "name" | "network" | "records">;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function computeResolveResultHash(input: ResolveHashInput): string {
  const data = stableStringify({
    name: input.name,
    network: input.network,
    records: input.records
  });
  const bytes = blake3(new TextEncoder().encode(data));
  return Buffer.from(bytes).toString("base64");
}

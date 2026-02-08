import punycode from "punycode";

/**
 * Implements specs/records/NameNormalization.md (draft).
 * - trim
 * - remove trailing dot
 * - split labels
 * - punycode to ASCII (A-label)
 * - lowercase
 * - rejoin
 */
export function normalizeName(input: string): string {
  if (typeof input !== "string") throw new Error("name must be a string");
  let name = input.trim();
  if (name.endsWith(".")) name = name.slice(0, -1);
  if (name.length === 0) throw new Error("empty name");

  const labels = name.split(".");
  if (labels.some(l => l.length === 0)) throw new Error("empty label");

  const outLabels: string[] = labels.map(label => {
    // Convert unicode to ASCII A-label as needed.
    // punycode.toASCII lowercases A-label output? not guaranteed; we lowercase later.
    const ascii = punycode.toASCII(label);
    return ascii;
  });

  const normalized = outLabels.join(".").toLowerCase();

  // Recommended policy checks (can be enforced by caller if you want “lenient” mode)
  validateNormalizedName(normalized);

  return normalized;
}

export function validateNormalizedName(normalized: string): void {
  if (normalized.length === 0) throw new Error("empty normalized name");
  if (normalized.endsWith(".")) throw new Error("normalized name must not end with dot");

  const labels = normalized.split(".");
  if (labels.some(l => l.length === 0)) throw new Error("empty label");

  // Basic DNS-ish policy (adjust if you allow underscores):
  const labelRe = /^[a-z0-9-]{1,63}$/;
  for (const l of labels) {
    if (!labelRe.test(l)) throw new Error(`invalid label: ${l}`);
  }

  // Optional total length cap (DNS limit is 253 excluding trailing dot)
  if (normalized.length > 253) throw new Error("name too long");
}

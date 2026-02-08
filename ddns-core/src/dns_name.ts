const RESERVED = new Set(["fuck", "shit", "cunt", "bitch", "ass"]);

export const DNS_NAME_MIN = 4;
export const DNS_NAME_MAX = 13;

export function validateDnsLabel(label: string): void {
  const lower = label.toLowerCase();
  if (lower.length < DNS_NAME_MIN || lower.length > DNS_NAME_MAX) {
    throw new Error("invalid length");
  }
  if (!/^[a-z0-9-]+$/.test(lower)) throw new Error("invalid characters");
  if (lower.startsWith("-") || lower.endsWith("-")) throw new Error("invalid hyphen position");
  if (RESERVED.has(lower)) throw new Error("reserved label");
}

export function normalizeDnsLabel(label: string): string {
  validateDnsLabel(label);
  return label.toLowerCase();
}

export type ResolveRecord = {
  type: string;
  value: string;
  ttl?: number;
};

export type ResolveResponse = {
  name: string;
  network: string;
  records: ResolveRecord[];
  metadata: Record<string, unknown>;
};

export function isResolveResponse(value: unknown): value is ResolveResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as ResolveResponse;
  if (typeof v.name !== "string" || typeof v.network !== "string") return false;
  if (!Array.isArray(v.records) || v.records.length === 0) return false;
  const hasValidRecord = v.records.some((record) =>
    record && typeof record.type === "string" && typeof record.value === "string"
  );
  if (!hasValidRecord) return false;
  if (!v.metadata || typeof v.metadata !== "object") return false;
  return true;
}

export type ResolveType = "A" | "AAAA";
export type ResolveConfidence = "high" | "medium" | "low";

export type ResolveAnswer = {
  name: string;
  type: string;
  data: string;
  ttl?: number;
};

export type UpstreamUsed = {
  url: string;
  rtt_ms?: number;
  rttMs?: number;
  status: string;
  answers_count?: number;
  answersCount?: number;
};

export type ResolveResponse = {
  name: string;
  type: ResolveType;
  answers: ResolveAnswer[];
  ttl_s: number;
  source: string;
  confidence?: ResolveConfidence;
  upstreams_used?: UpstreamUsed[];
  chosen_upstream?: { url: string; rtt_ms?: number; rttMs?: number };
  cache?: { hit: boolean; stale_used?: boolean };
  status?: string;
  rrset_hash?: string;
};

export type ResolveOptions = {
  baseUrl: string;
  name: string;
  type?: ResolveType;
  fetchImpl?: typeof fetch;
};

export async function resolve(options: ResolveOptions): Promise<ResolveResponse> {
  const { baseUrl, name, type = "A", fetchImpl = fetch } = options;
  return requestJson<ResolveResponse>({
    baseUrl,
    fetchImpl,
    method: "GET",
    path: "/v1/resolve",
    query: { name, type }
  });
}

export function isResolveConfidence(value: unknown): value is ResolveConfidence {
  return value === "high" || value === "medium" || value === "low";
}

export function isResolveResponse(value: unknown): value is ResolveResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ResolveResponse>;
  if (typeof v.name !== "string") return false;
  if (v.type !== "A" && v.type !== "AAAA") return false;
  if (!Array.isArray(v.answers)) return false;
  if (typeof v.ttl_s !== "number") return false;
  if (typeof v.source !== "string") return false;
  if (v.confidence !== undefined && !isResolveConfidence(v.confidence)) return false;
  if (v.rrset_hash !== undefined && typeof v.rrset_hash !== "string") return false;
  if (
    v.upstreams_used !== undefined &&
    (!Array.isArray(v.upstreams_used) ||
      !v.upstreams_used.every(
        (u) =>
          u &&
          typeof u.url === "string" &&
          (typeof u.rtt_ms === "number" || typeof u.rttMs === "number") &&
          typeof u.status === "string" &&
          (typeof u.answers_count === "number" || typeof u.answersCount === "number")
      ))
  ) {
    return false;
  }
  return true;
}

export function assertResponseShape(value: unknown): asserts value is ResolveResponse {
  if (!isResolveResponse(value)) {
    throw new Error("invalid_resolve_response_shape");
  }
}

export async function resolveOrThrow(options: ResolveOptions): Promise<ResolveResponse> {
  const response = await resolve(options);
  assertResponseShape(response);
  return response;
}

export type DomainContinuityPhase =
  | "A_SOFT_WARNING"
  | "B_HARD_WARNING"
  | "C_SAFE_PARKED"
  | "D_REGISTRY_FINALIZATION";

export type DomainStatusResponse = {
  domain: string;
  eligible: boolean;
  phase: DomainContinuityPhase;
  reason_codes: string[];
  next_steps: string[];
  credits_balance: number;
  credits_applied_estimate: number;
  renewal_due_date?: string;
  grace_expires_at?: string;
  policy_version?: string;
  notice_signature?: string;
};

export type DomainVerifyResponse = {
  domain: string;
  verification_method?: "dns_txt" | "account_token" | "signer_proof";
  txt_record_name?: string;
  txt_record_value?: string;
  verification_token?: string;
  expires_at?: string;
  policy_version?: string;
};

export type DomainRenewResponse = {
  domain: string;
  accepted: boolean;
  reason_codes: string[];
  credits_applied_estimate?: number;
  renewal_due_date?: string;
  grace_expires_at?: string;
  policy_version?: string;
  notice_signature?: string;
};

export type DomainContinuityClaimResponse = {
  domain: string;
  accepted: boolean;
  eligible: boolean;
  phase: DomainContinuityPhase;
  reason_codes: string[];
  next_steps: string[];
  policy_version?: string;
  notice_signature?: string;
};

export type DomainApiOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export async function getDomainStatus(
  options: DomainApiOptions & { domain: string }
): Promise<DomainStatusResponse> {
  const { baseUrl, fetchImpl = fetch, domain } = options;
  return requestJson<DomainStatusResponse>({
    baseUrl,
    fetchImpl,
    method: "GET",
    path: "/v1/domain/status",
    query: { domain }
  });
}

export async function startDomainVerify(
  options: DomainApiOptions & { domain: string }
): Promise<DomainVerifyResponse> {
  const { baseUrl, fetchImpl = fetch, domain } = options;
  return requestJson<DomainVerifyResponse>({
    baseUrl,
    fetchImpl,
    method: "POST",
    path: "/v1/domain/verify",
    body: { domain }
  });
}

export async function renewDomain(
  options: DomainApiOptions & { domain: string; useCredits?: boolean }
): Promise<DomainRenewResponse> {
  const { baseUrl, fetchImpl = fetch, domain, useCredits = true } = options;
  return requestJson<DomainRenewResponse>({
    baseUrl,
    fetchImpl,
    method: "POST",
    path: "/v1/domain/renew",
    body: { domain, use_credits: useCredits }
  });
}

export async function claimContinuity(
  options: DomainApiOptions & { domain: string }
): Promise<DomainContinuityClaimResponse> {
  const { baseUrl, fetchImpl = fetch, domain } = options;
  return requestJson<DomainContinuityClaimResponse>({
    baseUrl,
    fetchImpl,
    method: "POST",
    path: "/v1/domain/continuity/claim",
    body: { domain }
  });
}

type RequestJsonOptions = {
  baseUrl: string;
  fetchImpl: typeof fetch;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

async function requestJson<T>(options: RequestJsonOptions): Promise<T> {
  const { baseUrl, fetchImpl, method, path, query, body } = options;
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetchImpl(url.toString(), {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (!res.ok) {
    const responseBody = await safeJson(res);
    throw new Error(`request_failed:${method}:${path}:${res.status}:${responseBody?.error || res.statusText}`);
  }

  return (await res.json()) as T;
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

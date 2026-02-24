export type Tier = "Gold" | "Silver" | "Bronze" | "Verify-only";
export type TrafficSignal = "real" | "low" | "none";

export type DomainSignals = {
  domain: string;
  checked_at: string;
  dns_resolves: boolean;
  http_ok: boolean;
  status_code: number | null;
  content_length: number;
  title: string;
  h1s: string[];
  keywords: string[];
  entities: string[];
  reason_codes: string[];
};

export type ScoreDecision = {
  score: number;
  tier: Tier;
  traffic_signal: TrafficSignal;
  treasury_renewal_allowed: boolean;
  confidence: "low" | "medium" | "high";
  subsidy_estimate: number;
  reasons: string[];
  next_steps: string[];
  components: {
    rank_signal: number;
    traffic_estimate: number;
    authority: number;
    footprint: number;
    risk_penalty: number;
  };
};

export type ScanResult = {
  domain: string;
  updated_at: string;
  expires_at: string;
  signals: DomainSignals;
  decision: ScoreDecision;
};

export type ScanJob = {
  job_id: string;
  domain: string;
  status: "queued" | "running" | "done" | "failed";
  created_at: string;
  started_at?: string;
  finished_at?: string;
  error?: string;
  result?: ScanResult;
};

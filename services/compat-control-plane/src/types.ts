import type { IncomingMessage, ServerResponse } from 'node:http';

export type ReportChange = {
  page: string;
  status: string;
  notes?: string;
};

export type ReportData = {
  job_id: string;
  ok?: boolean;
  status: string;
  summary: string;
  changes?: ReportChange[];
  report_html?: string;
  report_url?: string;
};

export type JobRecord = {
  id: string;
  site_id: string;
  bundle_id: string;
  bundle_path: string;
  status: string;
  created_at: string;
  completed_at?: string;
  report?: ReportData;
};

export type SiteRecord = {
  site_id: string;
  site_url: string;
  site_name: string;
  connected_at: string;
};

export type WalletChallenge = {
  chain: string;
  address: string;
  message: string;
  issued_at: string;
  expires_at: string;
};

export type WalletSession = {
  token: string;
  chain: string;
  address: string;
  issued_at: string;
  expires_at: string;
};

export type PaymentRecord = {
  id: string;
  address: string;
  asset: string;
  amount: string;
  status: string;
  created_at: string;
};

export type CompatState = {
  dataDir: string;
  adminKey: string;
  allowUnauthenticated: boolean;
  sites: Map<string, SiteRecord>;
  jobs: Map<string, JobRecord>;
  walletChallenges: Map<string, WalletChallenge>;
  walletSessions: Map<string, WalletSession>;
  payments: Map<string, PaymentRecord>;
  paymentAddress: string;
  paymentAsset: string;
  paymentAmount: string;
  minerProofSecret: string;
};

export type RouteContext = {
  req: IncomingMessage;
  res: ServerResponse;
  params: RegExpMatchArray | null;
  body: any;
  state: CompatState;
};

export type RouteHandler = (ctx: RouteContext) => Promise<void> | void;

export type Route = {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
};

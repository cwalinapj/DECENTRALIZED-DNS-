export type DomainName = string;

export type RegistrarDomainStatus =
  | "active"
  | "expiring"
  | "expired"
  | "redemption"
  | "pending_transfer"
  | "unknown";

export type RenewalQuote = {
  price_usd: number;
  price_sol: number;
  supported: boolean;
  expires_at: string;
};

export type RenewalResult = {
  submitted: boolean;
  provider_ref: string;
  errors: string[];
};

export type DnsUpdateResult = {
  ok: boolean;
  provider_ref: string;
  errors: string[];
};

export type RegistrarPayment = {
  use_credits?: boolean;
  credits_amount?: number;
  payment_method?: "credits" | "fiat" | "card" | "stub";
};

export type RegistrarDomainRecord = {
  domain: DomainName;
  status: RegistrarDomainStatus;
  renewal_due_date?: string;
  grace_expires_at?: string;
  ns: string[];
  traffic_signal?: "none" | "low" | "real";
  credits_balance?: number;
};

export interface RegistrarAdapter {
  getDomain(domain: DomainName): Promise<RegistrarDomainRecord>;
  getRenewalQuote(domain: DomainName): Promise<RenewalQuote>;
  renewDomain(domain: DomainName, years: number, payment?: RegistrarPayment): Promise<RenewalResult>;
  setNameServers(domain: DomainName, ns: string[]): Promise<DnsUpdateResult>;
  getNameServers(domain: DomainName): Promise<{ ns: string[] }>;
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DomainContinuityPolicyInput } from "@ddns/core";
import type { DomainContinuityPhase } from "./notice_token.js";

export type StoredDomainStatus = {
  domain: string;
  challenge?: {
    txt_record_name: string;
    txt_record_value: string;
    token: string;
    expires_at: string;
  };
  status?: {
    eligible: boolean;
    phase: DomainContinuityPhase;
    reason_codes: string[];
    next_steps: string[];
    credits_balance: number;
    credits_applied_estimate: number;
    renewal_due_date: string;
    grace_expires_at: string;
    policy_version: string;
    auth_required: boolean;
    auth_mode: "stub";
  };
  claim_requested?: boolean;
  claim_requested_at?: string;
  last_updated_at: string;
  inputs?: DomainContinuityPolicyInput;
};

type DomainStatusStoreShape = {
  domains: Record<string, StoredDomainStatus>;
};

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function ensureStoreFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ domains: {} }, null, 2) + "\n", "utf8");
  }
}

function loadStore(filePath: string): DomainStatusStoreShape {
  ensureStoreFile(filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as DomainStatusStoreShape;
  if (!parsed.domains || typeof parsed.domains !== "object") {
    return { domains: {} };
  }
  return parsed;
}

function saveStore(filePath: string, store: DomainStatusStoreShape) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function createDomainStatusStore(filePath: string) {
  return {
    get(domainRaw: string): StoredDomainStatus | null {
      const domain = normalizeDomain(domainRaw);
      if (!domain) return null;
      const store = loadStore(filePath);
      return store.domains[domain] || null;
    },
    upsert(domainRaw: string, updater: (current: StoredDomainStatus | null) => StoredDomainStatus): StoredDomainStatus {
      const domain = normalizeDomain(domainRaw);
      if (!domain) throw new Error("invalid_domain");
      const store = loadStore(filePath);
      const current = store.domains[domain] || null;
      const next = updater(current);
      store.domains[domain] = next;
      saveStore(filePath, store);
      return next;
    },
    createChallenge(domainRaw: string) {
      const domain = normalizeDomain(domainRaw);
      if (!domain) throw new Error("invalid_domain");
      const token = crypto.randomBytes(12).toString("hex");
      const challenge = {
        txt_record_name: `_tolldns-verify.${domain}`,
        txt_record_value: `tolldns-verify=${token}`,
        token,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      };
      return this.upsert(domain, (current) => ({
        domain,
        ...current,
        challenge,
        last_updated_at: new Date().toISOString()
      }));
    }
  };
}

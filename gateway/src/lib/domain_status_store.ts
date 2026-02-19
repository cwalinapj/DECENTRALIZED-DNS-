import fs from "node:fs";
import fsp from "node:fs/promises";
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

async function ensureStoreFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, JSON.stringify({ domains: {} }, null, 2) + "\n", "utf8");
  }
}

async function loadStore(filePath: string): Promise<DomainStatusStoreShape> {
  await ensureStoreFile(filePath);
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as DomainStatusStoreShape;
    if (!parsed.domains || typeof parsed.domains !== "object") {
      return { domains: {} };
    }
    return parsed;
  } catch (err) {
    // Handle corrupted JSON
    return { domains: {} };
  }
}

async function saveStore(filePath: string, store: DomainStatusStoreShape) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  await fsp.writeFile(tmpPath, JSON.stringify(store, null, 2) + "\n", "utf8");
  await fsp.rename(tmpPath, filePath);
}

export function createDomainStatusStore(filePath: string) {
  // In-memory cache to prevent race conditions
  let cache: DomainStatusStoreShape | null = null;
  let pendingWrite: Promise<void> | null = null;
  const writeLock: Promise<void>[] = [];

  async function getCache(): Promise<DomainStatusStoreShape> {
    if (!cache) {
      cache = await loadStore(filePath);
    }
    return cache;
  }

  async function persistCache(store: DomainStatusStoreShape) {
    // Wait for any pending writes to complete
    if (pendingWrite) {
      await pendingWrite;
    }
    
    // Atomic write
    pendingWrite = saveStore(filePath, store);
    await pendingWrite;
    pendingWrite = null;
  }

  return {
    async get(domainRaw: string): Promise<StoredDomainStatus | null> {
      const domain = normalizeDomain(domainRaw);
      if (!domain) return null;
      const store = await getCache();
      return store.domains[domain] || null;
    },
    async upsert(domainRaw: string, updater: (current: StoredDomainStatus | null) => StoredDomainStatus): Promise<StoredDomainStatus> {
      const domain = normalizeDomain(domainRaw);
      if (!domain) throw new Error("invalid_domain");
      
      const store = await getCache();
      const current = store.domains[domain] || null;
      const next = updater(current);
      store.domains[domain] = next;
      cache = store;
      
      await persistCache(store);
      return next;
    },
    async createChallenge(domainRaw: string): Promise<StoredDomainStatus> {
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

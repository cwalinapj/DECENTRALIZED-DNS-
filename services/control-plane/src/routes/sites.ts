import type { ControlPlaneState, SiteRecord } from "../types.js";

export function listSites(state: ControlPlaneState): SiteRecord[] {
  return Array.from(state.sites.values());
}

export function getSite(state: ControlPlaneState, siteId: string): SiteRecord | undefined {
  return state.sites.get(siteId);
}

export function createSite(state: ControlPlaneState, input: Partial<SiteRecord>): SiteRecord {
  const siteId = input.site_id || `site_${Math.random().toString(36).slice(2, 10)}`;
  const record: SiteRecord = {
    site_id: siteId,
    name: input.name || siteId,
    domain: input.domain,
    created_at: new Date().toISOString(),
    metadata: input.metadata
  };
  state.sites.set(siteId, record);
  return record;
}

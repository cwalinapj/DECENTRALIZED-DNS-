export async function fetchAhrefsDomainOverview(_domain: string): Promise<{ status: "not_configured"; source: "apify_ahrefs" }> {
  return { status: "not_configured", source: "apify_ahrefs" };
}

export async function fetchSemrushDomainOverview(_domain: string): Promise<{ status: "not_configured"; source: "apify_semrush" }> {
  return { status: "not_configured", source: "apify_semrush" };
}

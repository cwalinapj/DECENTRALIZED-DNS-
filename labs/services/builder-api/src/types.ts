export type SitePage = {
  slug: string;
  title: string;
  body: string;
};

export type SiteModel = {
  siteId: string;
  subdomain: string;
  pages: SitePage[];
  updatedAt: string;
};

export type BuildJob = {
  jobId: string;
  siteId: string;
  createdAt: string;
};

import fs from "node:fs";
import path from "node:path";

export type SiteModel = {
  siteId: string;
  subdomain: string;
  pages: Array<{ slug: string; title: string; body: string }>;
};

export function renderPage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
}

export function buildSite(model: SiteModel, outputDir: string) {
  fs.mkdirSync(outputDir, { recursive: true });
  model.pages.forEach((page) => {
    const filename = page.slug === "index" ? "index.html" : `${page.slug}.html`;
    const html = renderPage(page.title, page.body);
    fs.writeFileSync(path.join(outputDir, filename), html);
  });
}

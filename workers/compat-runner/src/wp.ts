import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function loadBundle(bundlePath: string) {
  if (!bundlePath) {
    return { site: { url: 'http://localhost' }, plugins: [] };
  }
  try {
    const data = await fs.readFile(bundlePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { site: { url: 'http://localhost' }, plugins: [] };
  }
}

export async function spinStagingSite(bundle: any) {
  const siteUrl = bundle?.site?.url || 'http://localhost';
  return {
    url: siteUrl,
    plugins: bundle?.plugins || [],
    theme: bundle?.theme || {},
  };
}

export async function crawlPages(staging: any, count: number) {
  const pages: string[] = [];
  for (let i = 0; i < count; i += 1) {
    pages.push(new URL(`/${i + 1}`, staging.url).toString());
  }
  return pages;
}

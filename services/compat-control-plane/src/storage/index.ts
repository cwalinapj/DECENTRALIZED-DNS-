import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, payload, 'utf8');
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

export async function saveBundle(dataDir: string, siteId: string, bundle: unknown) {
  const bundleId = `bundle_${randomUUID()}`;
  const bundlePath = path.join(dataDir, 'sites', siteId, 'bundles', `${bundleId}.json`);
  await writeJson(bundlePath, bundle);
  return { bundleId, bundlePath };
}

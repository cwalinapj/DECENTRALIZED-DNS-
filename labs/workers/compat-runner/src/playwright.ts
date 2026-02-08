import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function captureSnapshots(pages: string[], outputDir: string, label: string) {
  const snapshots: { page: string; file: string }[] = [];
  const dir = path.join(outputDir, label);
  await fs.mkdir(dir, { recursive: true });

  for (const page of pages) {
    const fileName = `${encodeURIComponent(page)}.txt`;
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, `snapshot:${page}`);
    snapshots.push({ page, file: filePath });
  }

  return snapshots;
}

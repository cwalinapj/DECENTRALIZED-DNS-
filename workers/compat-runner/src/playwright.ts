import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

export async function screenshotSet(baseUrl: string, outDir: string, routes: string[]) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });

  const shots: { route: string; file: string; ok: boolean; error?: string }[] = [];
  for (const r of routes) {
    const url = baseUrl.replace(/\/+$/, "") + r;
    const file = path.join(outDir, routeToFile(r));
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.screenshot({ path: file, fullPage: true });
      shots.push({ route: r, file: path.basename(file), ok: true });
    } catch (e: any) {
      shots.push({ route: r, file: path.basename(file), ok: false, error: String(e?.message || e) });
    }
  }

  await browser.close();
  return shots;
}

function routeToFile(route: string) {
  const r = route === "/" ? "home" : route.replace(/[^\w]+/g, "_");
  return `${r}.png`;
}

import fs from "node:fs";
import path from "node:path";
import { unpackBundle, readManifest } from "./bundle.js";
import { screenshotSet } from "./playwright.js";
import { makeReport } from "./report.js";

const IN_ZIP = "/in/bundle.zip";
const WORK = "/work/unpacked";
const OUT = "/out";
const OUT_SCREENS = path.join(OUT, "screens");

async function main() {
  if (!fs.existsSync(IN_ZIP)) throw new Error("missing /in/bundle.zip");

  unpackBundle(IN_ZIP, WORK);
  const manifest = readManifest(WORK);

  // MVP: we do not fully stand up WP here yet; we just demonstrate vision flow.
  // Next step: start a wp:php-apache container and mount unpacked wp-content + import db.sql
  // For now, target a URL passed via env or fallback to manifest site_url.
  const baseUrl = process.env.STAGING_BASE_URL || manifest.site_url || "http://example.invalid";

  const routes = ["/", "/wp-login.php"]; // add more later / user-configurable
  const baseline = await screenshotSet(baseUrl, OUT_SCREENS + "/baseline", routes);

  // "After upgrade simulation" placeholder: in next iteration, update plugins in staging here.
  const after = await screenshotSet(baseUrl, OUT_SCREENS + "/after", routes);

  const report = makeReport({
    ok: true,
    manifest,
    baseline,
    after,
    notes: [
      "MVP runner currently captures screenshots only.",
      "Next: provision WP staging, install plugins, import db.sql, simulate upgrades, rerun screenshots, compute diffs."
    ]
  });

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
}

main().catch((e) => {
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ ok: false, error: String(e?.message || e) }, null, 2));
  process.exit(1);
});

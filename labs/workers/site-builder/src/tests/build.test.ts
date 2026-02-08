import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { buildSite } from "../build.js";

const output = path.resolve("/tmp/ddns-site-builder-test");
fs.rmSync(output, { recursive: true, force: true });

buildSite({
  siteId: "site_demo",
  subdomain: "demo",
  pages: [
    { slug: "index", title: "Home", body: "Welcome" },
    { slug: "about", title: "About", body: "About" },
    { slug: "services", title: "Services", body: "Services" },
    { slug: "gallery", title: "Gallery", body: "Gallery" },
    { slug: "contact", title: "Contact", body: "Contact" }
  ]
}, output);

const files = fs.readdirSync(output).sort();
assert.strictEqual(files.length, 5);
assert.ok(files.includes("index.html"));
assert.ok(files.includes("about.html"));
assert.ok(files.includes("services.html"));
assert.ok(files.includes("gallery.html"));
assert.ok(files.includes("contact.html"));

console.log("site builder test passed");

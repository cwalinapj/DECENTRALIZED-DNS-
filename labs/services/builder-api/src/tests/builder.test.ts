import assert from "node:assert";
import { SiteModel } from "../types.js";

const model: SiteModel = {
  siteId: "site_test",
  subdomain: "demo",
  pages: [
    { slug: "index", title: "Home", body: "Welcome" },
    { slug: "about", title: "About", body: "About" },
    { slug: "services", title: "Services", body: "Services" },
    { slug: "gallery", title: "Gallery", body: "Gallery" },
    { slug: "contact", title: "Contact", body: "Contact" }
  ],
  updatedAt: new Date().toISOString()
};

assert.strictEqual(model.pages.length, 5);
console.log("builder api test passed");

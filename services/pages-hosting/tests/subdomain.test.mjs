import assert from "node:assert";
import { __test__ } from "../worker/index.js";

assert.strictEqual(__test__.extractSubdomain("demo.example.com", "example.com"), "demo");
assert.strictEqual(__test__.extractSubdomain("example.com", "example.com"), null);
assert.strictEqual(__test__.extractSubdomain("bad.com", "example.com"), null);
assert.strictEqual(__test__.normalizeSubdomain("DeMo"), "demo");

console.log("pages-hosting tests passed");

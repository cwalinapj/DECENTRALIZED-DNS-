import assert from "node:assert";
import { computeNodeName } from "../scripts/node-name.mjs";

const fixture = Buffer.from("a".repeat(32)).toString("base64");
const name = computeNodeName(fixture);
assert.ok(name.startsWith("node-"));
assert.ok(name.endsWith(".dns"));
assert.strictEqual(name.length, "node-".length + 10 + ".dns".length);
console.log("node-name tests passed");

import assert from "node:assert";
import { balanceOf } from "../server.js";

(async () => {
  if (process.env.RUN_INTEGRATION !== "1") {
    console.log("passport integration skipped");
    return;
  }
  const ok = await balanceOf("0x0000000000000000000000000000000000000000");
  assert.strictEqual(typeof ok, "boolean");
  console.log("passport integration test passed");
})();

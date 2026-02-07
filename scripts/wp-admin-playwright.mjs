import { chromium } from "@playwright/test";

const baseUrl = process.env.WP_BASE_URL || "http://localhost:8080";
const adminUser = process.env.WP_ADMIN_USER || "admin";
const adminPass = process.env.WP_ADMIN_PASS || "adminpass";
const screenshotPath = process.env.SCREENSHOT_PATH || "/tmp/wp-admin-compat.png";

async function main() {
  const loginUrl = new URL("/wp-login.php", baseUrl).toString();
  const adminUrl = new URL("/wp-admin/options-general.php?page=ddns-compat", baseUrl).toString();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  page.setDefaultTimeout(60_000);

  await page.goto(loginUrl, { waitUntil: "networkidle" });
  await page.fill("#user_login", adminUser);
  await page.fill("#user_pass", adminPass);
  await page.click("#wp-submit");
  await page.waitForURL(/wp-admin/);

  await page.goto(adminUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("#ddnsRegister");
  await page.waitForSelector("#ddnsRunCheck");
  await page.waitForSelector("#ddnsPoll");

  const status = page.locator("#ddnsStatus");
  const initialStatus = (await status.textContent()) || "";

  await page.click("#ddnsRegister");
  await page.waitForFunction(
    ({ selector, initialText }) => {
      const el = document.querySelector(selector);
      return el && el.textContent && el.textContent !== initialText;
    },
    { selector: "#ddnsStatus", initialText: initialStatus }
  );

  const updatedStatus = (await status.textContent()) || "";
  if (!updatedStatus.includes("registered")) {
    throw new Error(`Expected registration status update, got: ${updatedStatus}`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

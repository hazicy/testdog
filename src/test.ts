import { chromium } from "playwright";
import { Observer } from "./automation/observer";

(async () => {
  const browser = await chromium.launch({
    headless: process.env.AUTOMATION_HEADLESS === "true",
  });
  const context = await browser.newContext();

  const page = await context.newPage();

  await page.goto("https://batch-task-app.a1aws.geesdev.com/manage/no-login");

  await page.waitForTimeout(1000);

  const observer = new Observer();

  const result = await observer.observe(page);

  console.log("result", result);
})();

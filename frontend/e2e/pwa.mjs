import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const evidence = JSON.parse(
  await fs.readFile("../docs/evidence/browser-smoke.json", "utf8"),
);
const base = "http://127.0.0.1:4173";
let debugPage;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  debugPage = page;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login");
  await page
    .getByPlaceholder("3–32 位字母、数字或下划线")
    .fill(evidence.accounts.admin);
  await page.getByPlaceholder("至少 8 位").fill("DutyDemo123!");
  await page.getByRole("button", { name: "登录，看看今天轮到谁" }).click();
  await page.waitForURL(base + "/");
  await page.locator(".today-card").waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.locator(".today-card").waitFor();
  assert(
    await page.evaluate(() => !!navigator.serviceWorker.controller),
    "SW controls production page",
  );
  const manifest = await (
    await page.request.get(base + "/manifest.webmanifest")
  ).json();
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/");
  for (const icon of manifest.icons) {
    const r = await page.request.get(base + icon.src);
    assert(r.ok());
    assert.equal(r.headers()["content-type"], "image/png");
  }
  await page.goto(base + "/schedule");
  await page.locator(".calendar-card").waitFor();
  await page.reload();
  await page.locator(".calendar-card").waitFor();
  const cached = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((r) => new URL(r.url).pathname));
    }
    return urls;
  });
  assert(
    !cached.some((p) =>
      /^\/(auth|dorms|duties|notifications|push)(\/|$)/.test(p),
    ),
    "no private API precache",
  );
  await context.setOffline(true);
  await page.reload();
  await page
    .getByText(/(当前离线|连接服务失败) · 打卡与排班需要联网/)
    .waitFor();
  await page.getByRole("button", { name: "登录，看看今天轮到谁" }).waitFor();
  await page
    .getByPlaceholder("3–32 位字母、数字或下划线")
    .fill(evidence.accounts.admin);
  await page.getByPlaceholder("至少 8 位").fill("DutyDemo123!");
  await page.getByRole("button", { name: "登录，看看今天轮到谁" }).click();
  await page
    .getByText(/当前离线，请联网后重试|连接服务失败，请稍后重试/)
    .waitFor();
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  const result = {
    date: new Date().toISOString(),
    base,
    status: "passed",
    checks: [
      "production service worker registration and control",
      "manifest and PNG icons",
      "SPA deep-link reload",
      "offline shell and truthful network error",
      "no private API in precache",
    ],
    cacheEntries: cached.length,
    runtimeErrors: errors,
    iphone: "not tested",
    push: "not tested; VAPID/HTTPS/device not supplied",
  };
  await fs.writeFile(
    "../docs/evidence/pwa-browser.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.log({
    url: debugPage.url(),
    body: await debugPage.locator("body").innerText(),
    online: await debugPage.evaluate(() => navigator.onLine),
  });
  await debugPage.screenshot({
    path: "../docs/evidence/pwa-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}

import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const evidence = JSON.parse(
  await fs.readFile("../docs/evidence/browser-smoke.json", "utf8"),
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const base = "http://127.0.0.1:5173";
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const loginWidths = [];
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base + "/login");
    await page.getByRole("button", { name: "登录，看看今天轮到谁" }).waitFor();
    const dimensions = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    assert.equal(dimensions[0], dimensions[1]);
    loginWidths.push(width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByPlaceholder("3–32 位字母、数字或下划线")
    .fill(evidence.accounts.admin);
  await page.getByPlaceholder("至少 8 位").fill("DutyDemo123!");
  await page.getByRole("button", { name: "登录，看看今天轮到谁" }).click();
  await page.waitForURL(base + "/");
  await page.locator(".today-card").waitFor();
  await page.goto(base + "/profile");
  await page
    .getByText("系统通知暂未开通，站内提醒正常使用。", { exact: true })
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "开启本设备通知", exact: true })
      .isDisabled(),
  );
  assert(
    await page
      .getByRole("button", { name: "发送测试通知", exact: true })
      .isDisabled(),
  );
  await page.goto(base + "/schedule?date=2026-10-11");
  await page.locator(".calendar-card").waitFor();
  assert(
    (await page.locator(".calendar-grid button.chosen").innerText()).startsWith(
      "11",
    ),
  );
  await page.goto(base + "/messages");
  await page.locator(".note-card.unread").first().waitFor();
  await page.locator(".note-card.unread").first().click();
  await page.getByText(/已读/).first().waitFor();
  await page.goto(base + "/profile");
  await page
    .getByText("系统通知暂未开通，站内提醒正常使用。", { exact: true })
    .waitFor();
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await page.screenshot({
    path: "../docs/evidence/profile-final.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.waitForURL(base + "/login");
  await page.goto(base + "/history");
  await page.waitForURL(/\/login\?next=/);
  assert.deepEqual(errors, []);
  const result = {
    date: new Date().toISOString(),
    status: "passed",
    loginWidths,
    checks: [
      "unconfigured push is clearly disabled",
      "notification date route selects corresponding day",
      "real worker-created message can be read",
      "logout clears identity and route guard redirects",
    ],
    runtimeErrors: errors,
  };
  await fs.writeFile(
    "../docs/evidence/final-browser.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}

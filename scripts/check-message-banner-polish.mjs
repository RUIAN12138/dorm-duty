import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const b = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "chromium"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {}),
});
const out = new URL("../data/message-banner/", import.meta.url);
await fs.mkdir(out, { recursive: true });
const p = await b.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
function check(v, label) {
  assert(v, label);
  checks.push(label);
  console.log("PASS " + label);
}
const card = p.locator(".reminder-banner-card");
const input = p.locator(".banner-reply-input");
async function hold() {
  const r = await card.boundingBox();
  await p.mouse.move(r.x + 80, r.y + 24);
  await p.mouse.down();
  await p.waitForTimeout(430);
  await p.mouse.up();
  await input.waitFor({ state: "visible" });
  await p.waitForTimeout(350);
}
async function fresh() {
  await p.getByRole("button", { name: "新消息", exact: true }).click();
  await card.waitFor();
  await p.waitForTimeout(400);
}
try {
  await p.goto(process.env.DORM_BANNER_PREVIEW_URL || "http://127.0.0.1:8093/");
  await card.waitFor();
  await p.waitForTimeout(450);
  check(
    await p.getByText("独立测试版本 · 合成数据").isVisible(),
    "test build is explicitly labelled and independent",
  );
  await hold();
  await input.fill("测试回复内容");
  await p.locator(".banner-reply-cancel").click();
  await p.waitForTimeout(350);
  await p.getByRole("button", { name: "查询模拟后台" }).click();
  check(
    (await p.getByTestId("preview-backend").innerText()).includes(
      '"read_at": null',
    ),
    "cancel returns to capsule and remains unread on fresh mock query",
  );
  await p.getByLabel("发送失败", { exact: true }).check();
  await hold();
  await input.fill("失败保留草稿");
  await p.locator(".banner-reply-send").click();
  await p.getByRole("alert").waitFor();
  check(
    (await input.inputValue()) === "失败保留草稿",
    "failed send preserves draft",
  );
  await p.locator(".banner-reply-cancel").click();
  await p.waitForTimeout(350);
  await p.getByLabel("发送失败", { exact: true }).uncheck();
  await p.getByLabel("已读同步失败", { exact: true }).check();
  await hold();
  await p.locator(".banner-reply-close").click();
  await card.waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "查询模拟后台" }).click();
  check(
    (await p.getByTestId("preview-backend").innerText()).includes(
      '"read_at": null',
    ),
    "failed explicit-close receipt does not fake read success",
  );
  await p.getByRole("button", { name: "恢复同步并重试" }).click();
  await p.waitForFunction(() => {
    const text = document.querySelector(
      '[data-testid="preview-backend"]',
    )?.textContent;
    return text && !text.includes('"read_at": null');
  });
  check(true, "preview read queue can recover and query a persisted timestamp");
  await fresh();
  await hold();
  await input.fill("发送成功");
  await p.locator(".banner-reply-send").click();
  await card.waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "查询模拟后台" }).click();
  check(
    !(await p.getByTestId("preview-backend").innerText()).includes(
      '"read_at": null',
    ),
    "successful reply reads its incoming message",
  );
  await fresh();
  await hold();
  await input.fill("完整边框\n光标和多行输入\n不会被裁切");
  await p.screenshot({
    path: new URL(engine + "-preview-light.png", out).pathname,
  });
  await p.locator(".banner-reply-cancel").click();
  await p.waitForTimeout(350);
  await p.getByRole("button", { name: "明 / 暗" }).click();
  await hold();
  await p.screenshot({
    path: new URL(engine + "-preview-dark.png", out).pathname,
  });
  check(errors.length === 0, "preview has no Vue runtime errors");
  await fs.writeFile(
    new URL(engine + "-preview-result.json", out),
    JSON.stringify(
      {
        checks,
        errors,
        scope:
          "synthetic local preview; not real server or native device acceptance",
      },
      null,
      2,
    ),
  );
} finally {
  await b.close();
}

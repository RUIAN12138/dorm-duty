import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const output = path.resolve(process.env.EVIDENCE_DIR || "../docs/evidence");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const issues = [];
const contextA = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const contextB = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const a = await contextA.newPage(),
  b = await contextB.newPage();
for (const page of [a, b]) page.on("pageerror", (e) => issues.push(e.message));
const suffix = Date.now().toString(36);
const usernameA = `admin_${suffix}`,
  usernameB = `member_${suffix}`;
const password = "DutyDemo123!";
async function register(page, username, nickname) {
  await page.goto(base + "/login");
  await page.getByRole("button", { name: "注册账号", exact: true }).click();
  await page.getByPlaceholder("3–32 位字母、数字或下划线").fill(username);
  await page.getByPlaceholder("室友怎么称呼你").fill(nickname);
  await page.getByPlaceholder("至少 8 位").fill(password);
  await page.getByRole("button", { name: "注册并开始使用" }).click();
  await page.waitForURL(base + "/");
  await page.getByRole("button", { name: "创建或加入宿舍" }).waitFor();
}
async function auth(page) {
  return {
    Authorization:
      "Bearer " +
      (await page.evaluate(() => sessionStorage.getItem("dorm-token"))),
  };
}
async function json(page, url, options = {}) {
  const response = await page.request.fetch(base + url, {
    ...options,
    headers: await auth(page),
  });
  assert(
    response.ok(),
    `${url}: ${response.status()} ${await response.text()}`,
  );
  return response.json();
}
async function waitPage(page) {
  await page.locator("main.page").waitFor();
  await page.locator(".page-loading").waitFor({ state: "hidden" });
  await page.locator(".error-panel").waitFor({ state: "hidden" });
  await page.locator(".van-toast").waitFor({ state: "hidden" });
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
}
try {
  await a.goto(base + "/login");
  await a.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await a.screenshot({ path: output + "/login-390.png", fullPage: true });
  await register(a, usernameA, "张同学");
  await a.goto(base + "/dorm");
  await a.getByRole("button", { name: "创建宿舍", exact: true }).click();
  await a.getByPlaceholder("例如 6-402").fill("6-402");
  await a.getByRole("button", { name: "创建宿舍", exact: true }).last().click();
  await a.locator(".invite-card").waitFor();
  const dorm = await json(a, "/dorms/current");
  await register(b, usernameB, "李同学");
  await b.goto(base + "/dorm");
  await b.getByPlaceholder("8 位邀请码").fill(dorm.invite_code);
  await b.getByRole("button", { name: "加入宿舍", exact: true }).click();
  await b.locator(".invite-card").waitFor();
  assert.equal((await json(b, "/dorms/current")).id, dorm.id);
  const meA = await json(a, "/auth/me");
  const meB = await json(b, "/auth/me");
  // Additional isolated QA accounts provide a realistic six-person calendar, via the public API.
  for (const [index, nickname] of [
    "王同学",
    "陈同学",
    "刘同学",
    "赵同学",
  ].entries()) {
    const username = `qa${index}_${suffix}`;
    let r = await a.request.post(base + "/auth/register", {
      data: { username, password, nickname },
    });
    assert.equal(r.status(), 201);
    r = await a.request.post(base + "/auth/login", {
      data: { username, password },
    });
    const token = (await r.json()).access_token;
    r = await a.request.post(base + "/dorms/join", {
      headers: { Authorization: "Bearer " + token },
      data: { invite_code: dorm.invite_code },
    });
    assert.equal(r.status(), 200);
  }
  await a.goto(base + "/schedule");
  await a.getByRole("button", { name: "生成 / 补齐排班", exact: true }).click();
  await a
    .locator(".elastic-sheet")
    .getByRole("button", { name: "生成并补齐", exact: true })
    .click();
  await a.locator(".elastic-sheet").waitFor({ state: "hidden" });
  await waitPage(a);
  const today = await json(a, "/duties/today");
  const nowDorm = await json(a, "/dorms/current");
  await json(a, `/duties/${today.task.id}`, {
    method: "PATCH",
    data: { assignee_id: meA.id, expected_version: nowDorm.schedule_version },
  });
  await a.goto(base + "/");
  await a
    .getByRole("button", { name: /完成值日打卡|补打卡，记录完成/ })
    .waitFor();
  await waitPage(a);
  await a.screenshot({ path: output + "/home-390.png", fullPage: true });
  await a.screenshot({ path: output + "/home-viewport.png" });
  const overflow = [];
  for (const width of [320, 375, 390, 430, 768]) {
    await a.setViewportSize({ width, height: 844 });
    for (const route of [
      "/",
      "/dorm",
      "/schedule",
      "/history",
      "/profile",
      "/messages",
    ]) {
      await a.goto(base + route);
      await waitPage(a);
      const dimensions = await a.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      if (dimensions.scroll > dimensions.client)
        overflow.push({ width, route, ...dimensions });
      if (
        width === 390 &&
        ["/dorm", "/schedule", "/history", "/profile", "/messages"].includes(
          route,
        )
      )
        await a.screenshot({
          path: output + "/" + route.slice(1) + "-390.png",
          fullPage: true,
        });
    }
  }
  assert.deepEqual(overflow, [], "mobile layout overflow");
  await a.setViewportSize({ width: 390, height: 844 });
  await a.goto(base + "/");
  await a
    .getByRole("button", { name: /完成值日打卡|补打卡，记录完成/ })
    .click();
  await a.getByText("今天的小事，已经被认真做好。", { exact: false }).waitFor();
  await b.goto(base + "/");
  await b.getByText("今天的小事，已经被认真做好。", { exact: false }).waitFor();
  const taskA = (await json(a, "/duties/today")).task,
    taskB = (await json(b, "/duties/today")).task;
  assert.equal(taskA.status, "completed");
  assert.equal(taskA.completed_at, taskB.completed_at);
  const duplicate = await a.request.patch(
    base + `/duties/${taskA.id}/complete`,
    { headers: await auth(a) },
  );
  assert.equal(duplicate.status(), 409);
  await a.reload();
  await a.getByText("今天的小事，已经被认真做好。", { exact: false }).waitFor();
  await a.goto(base + "/profile");
  await waitPage(a);
  await a.getByLabel("昵称", { exact: true }).fill("张同学 QA");
  await a.getByRole("button", { name: "保存昵称", exact: true }).click();
  await a.getByRole("heading", { name: "张同学 QA", exact: true }).waitFor();
  await a.goto(base + "/history");
  await waitPage(a);
  assert.equal(
    (await json(a, "/duties/today")).task.assignee_name_snapshot,
    "张同学",
  );
  assert.deepEqual(issues, [], "browser runtime errors");
  const evidence = {
    date: new Date().toISOString(),
    base,
    browser: "Chrome headless",
    accounts: { admin: usernameA, member: usernameB },
    checks: [
      "UI registration",
      "UI create and invite join",
      "six member API fixture",
      "UI generation",
      "30 mobile layout combinations",
      "UI complete and cross-context refresh",
      "duplicate completion 409",
      "reload restores identity",
      "UI nickname update preserves historical snapshot",
    ],
    runtimeErrors: issues,
    overflow,
  };
  await fs.writeFile(
    output + "/browser-smoke.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify({ status: "passed", ...evidence }, null, 2));
} catch (error) {
  await a.screenshot({ path: output + "/failure.png", fullPage: true });
  console.log(await a.locator("main").innerText());
  console.log(await a.getByRole("button").allTextContents());
  throw error;
} finally {
  await browser.close();
}

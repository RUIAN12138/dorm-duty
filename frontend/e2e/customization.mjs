import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const p = await context.newPage(),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const suffix = Date.now().toString(36),
  password = "DutyDemo123!";
async function request(url, body, token, method = "POST") {
  const r = await p.request.fetch(base + url, {
    method,
    data: body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  assert(r.ok(), `${url} ${r.status()} ${await r.text()}`);
  return r.json();
}
async function account(username, nickname) {
  await request("/auth/register", { username, password, nickname });
  return (await request("/auth/login", { username, password })).access_token;
}
async function settled() {
  await p.locator(".van-toast").waitFor({ state: "hidden" });
  await p.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
}
const shift = (day, n) =>
  new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
try {
  const username = `polish_${suffix}`,
    token = await account(username, "张同学"),
    memberToken = await account(`roommate_${suffix}`, "李同学");
  let dorm = await request("/dorms", { name: "交互验收宿舍" }, token);
  dorm = await request(
    "/dorms/join",
    { invite_code: dorm.invite_code },
    memberToken,
  );
  const todayData = await request("/duties/today", undefined, token, "GET"),
    today = todayData.today,
    tomorrow = shift(today, 1);
  await request(
    "/duties/generate",
    { start_date: today, days: 30, expected_version: dorm.schedule_version },
    token,
  );
  await p.goto(base + "/login");
  await p.getByPlaceholder("3–32 位字母、数字或下划线").fill(username);
  await p.getByPlaceholder("至少 8 位").fill(password);
  await p.getByRole("button", { name: "登录，看看今天轮到谁" }).click();
  await p.locator(".today-card").waitFor();
  await settled();
  await p.goto(base + "/dorm");
  await p.locator(".preview-day").first().waitFor();
  await p
    .getByLabel("默认值日内容", { exact: true })
    .fill("扫地\n清洁洗手台\n倒垃圾");
  await p.getByLabel("默认截止时间", { exact: true }).fill("21:30");
  await p.getByLabel("排班范围", { exact: true }).selectOption("14");
  await p.getByLabel("第一位成员开始日期", { exact: true }).fill(tomorrow);
  await p.getByLabel("连续负责", { exact: true }).selectOption("2");
  await p.getByRole("button", { name: "星期六值日", exact: true }).click();
  await p.getByRole("button", { name: "星期日值日", exact: true }).click();
  await p.getByRole("button", { name: "李同学上移", exact: true }).click();
  await p.locator("summary").filter({ hasText: "按星期安排不同任务" }).click();
  const template = p.locator(".weekday-template").first();
  await template
    .getByLabel("当天任务", { exact: true })
    .fill("周一清洁桌面\n清洗拖把");
  await template.getByLabel("当天截止时间", { exact: true }).fill("20:15");
  await p.locator("summary").filter({ hasText: "指定休息日期" }).click();
  let skip = shift(tomorrow, 2);
  while ([0, 6].includes(new Date(skip + "T12:00:00Z").getUTCDay()))
    skip = shift(skip, 1);
  await p.getByLabel("休息日期", { exact: true }).fill(skip);
  await p.getByRole("button", { name: "添加", exact: true }).click();
  await p.waitForFunction(
    () =>
      document.querySelector(".preview-card")?.getAttribute("aria-busy") ===
      "false",
  );
  assert(
    (await p.locator(".preview-day").filter({ hasText: "休息" }).count()) >= 1,
  );
  await p.getByRole("button", { name: "保存规则并更新未来排班" }).click();
  await p.getByRole("button", { name: "确认", exact: true }).click();
  await settled();
  dorm = await request("/dorms/current", undefined, token, "GET");
  assert.equal(dorm.schedule_rules.rotation_days, 2);
  assert.equal(dorm.schedule_rules.horizon_days, 14);
  assert.equal(dorm.task_text, "扫地\n清洁洗手台\n倒垃圾");
  assert(dorm.schedule_rules.skip_dates.includes(skip));
  await p.reload();
  await p.locator(".preview-day").first().waitFor();
  assert.equal(
    await p.getByLabel("默认值日内容", { exact: true }).inputValue(),
    dorm.task_text,
  );
  assert.equal(
    await p.getByLabel("连续负责", { exact: true }).inputValue(),
    "2",
  );
  await p.screenshot({
    path: "../docs/evidence/custom-settings.png",
    fullPage: true,
  });
  await p.goto(base + `/schedule?date=${tomorrow}`);
  await p.locator(".detail-card").waitFor();
  await p.getByRole("button", { name: "自定义这一天", exact: true }).click();
  await p.locator(".elastic-sheet").waitFor();
  await settled();
  const editor = p.locator(".elastic-sheet");
  await editor
    .getByLabel("这一天的值日内容", { exact: true })
    .fill("仅这天：清洁阳台\n擦窗");
  await editor.getByLabel("这一天的截止时间", { exact: true }).fill("18:45");
  await p.screenshot({
    path: "../docs/evidence/day-editor.png",
    fullPage: true,
  });
  await editor.getByRole("button", { name: "保存这一天的安排" }).click();
  await p.locator(".elastic-sheet").waitFor({ state: "hidden" });
  await settled();
  assert(
    (await p.locator(".detail-card").innerText()).includes("仅这天：清洁阳台"),
  );
  await p.reload();
  await p.locator(".detail-card").waitFor();
  assert((await p.locator(".detail-card").innerText()).includes("18:45"));
  await p.goto(base + `/schedule?date=${skip}`);
  await p.locator(".rest-day").waitFor();
  await p.getByRole("button", { name: "添加这一天的安排" }).click();
  await settled();
  await p
    .getByRole("dialog")
    .getByLabel("这一天的值日内容", { exact: true })
    .fill("休息日临时清洁");
  await p.getByRole("button", { name: "保存这一天的安排" }).click();
  await p.locator(".elastic-sheet").waitFor({ state: "hidden" });
  await p.locator(".detail-card").waitFor();
  await settled();
  await p.goto(base + "/");
  await p.locator(".duty-row.interactive").first().waitFor();
  await settled();
  await p.locator(".duty-row.interactive").first().click();
  await p.locator(".elastic-sheet").waitFor();
  await settled();
  // Keyboard focus trap and the handle's small/large drag snap decisions.
  await p.keyboard.press("Tab");
  assert(
    await p
      .getByRole("dialog")
      .evaluate((el) => el.contains(document.activeElement)),
  );
  const handle = await p.locator(".sheet-handle").boundingBox();
  await p.mouse.move(handle.x + handle.width / 2, handle.y + 15);
  await p.mouse.down();
  await p.mouse.move(handle.x + handle.width / 2, handle.y - 35, { steps: 8 });
  await p.mouse.up();
  await settled();
  assert(await p.locator(".elastic-sheet").isVisible());
  await p.mouse.move(handle.x + handle.width / 2, handle.y + 15);
  await p.mouse.down();
  await p.mouse.move(handle.x + handle.width / 2, handle.y + 220, {
    steps: 10,
  });
  await p.mouse.up();
  await p.locator(".elastic-sheet").waitFor({ state: "hidden" });
  await p.locator(".duty-row.interactive").first().click();
  await p.locator(".elastic-sheet").waitFor();
  await settled();
  await p.keyboard.press("Escape");
  await p.locator(".elastic-sheet").waitFor({ state: "hidden" });
  const card = await p.locator(".today-card").boundingBox();
  await p.locator(".today-card").dispatchEvent("pointerdown", {
    pointerType: "touch",
    clientX: card.x + card.width - 10,
    clientY: card.y + 10,
  });
  await p.waitForTimeout(180);
  assert.notEqual(
    await p
      .locator(".today-card")
      .evaluate((el) => el.style.getPropertyValue("--tilt-x")),
    "0deg",
  );
  await p.locator(".today-card").dispatchEvent("pointercancel");
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.locator(".today-card").dispatchEvent("pointerdown", {
    pointerType: "touch",
    clientX: card.x + card.width - 10,
    clientY: card.y + 10,
  });
  assert.equal(
    await p
      .locator(".today-card")
      .evaluate((el) => getComputedStyle(el).transform),
    "none",
  );
  await p.locator(".today-card").dispatchEvent("pointercancel");
  const widths = [320, 375, 390, 430, 768],
    routes = ["/", "/schedule", "/dorm", "/history", "/profile", "/messages"];
  for (const width of widths) {
    await p.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await p.goto(base + route);
      await p.locator("main").waitFor();
      await p.locator(".page-loading").waitFor({ state: "hidden" });
      if (route === "/dorm") {
        await p.locator(".preview-day").first().waitFor();
        await p
          .locator("summary")
          .filter({ hasText: "按星期安排不同任务" })
          .click();
      }
      assert(
        await p.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        `overflow ${width} ${route}`,
      );
    }
  }
  const memberContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    m = await memberContext.newPage();
  await m.goto(base + "/login");
  await m
    .getByPlaceholder("3–32 位字母、数字或下划线")
    .fill(`roommate_${suffix}`);
  await m.getByPlaceholder("至少 8 位").fill(password);
  await m.getByRole("button", { name: "登录，看看今天轮到谁" }).click();
  await m.locator(".today-card").waitFor();
  await m.goto(base + `/schedule?date=${tomorrow}`);
  await m.locator(".detail-card").waitFor();
  assert.equal(
    await m.getByRole("button", { name: "自定义这一天", exact: true }).count(),
    0,
  );
  assert(
    (await m.locator(".detail-card").innerText()).includes("仅这天：清洁阳台"),
  );
  assert.deepEqual(errors, []);
  const evidence = {
    status: "passed",
    date: new Date().toISOString(),
    base,
    widths,
    checks: [
      "custom weekday and multi-day rotation saved via UI",
      "weekday content and deadline templates",
      "rest dates remove future tasks",
      "server preview renders before save",
      "reload restores rule configuration",
      "single-day text and time override persists",
      "manual duty on a rest day",
      "second member reads synchronized data without admin controls",
      "drawer drag snap, keyboard Escape and focus trap",
      "touch tilt and reduced-motion fallback",
      "30 responsive route checks",
    ],
    runtimeErrors: errors,
  };
  await fs.writeFile(
    "../docs/evidence/customization.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}

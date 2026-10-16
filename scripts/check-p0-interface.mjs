// Isolated application fixture and in-memory API. Never writes to a real dorm.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
const root = new URL("../", import.meta.url).pathname,
  front = path.join(root, "frontend"),
  name = `p0-qa-${process.pid}`;
const evidence = path.join(root, "docs/evidence/p0-interface"),
  h = await createHarness();
let server, browser;
const checks = [],
  errors = [];
const check = (a, b, label) => {
  assert.deepEqual(a, b, label);
  checks.push(label);
};
try {
  await fs.mkdir(evidence, { recursive: true });
  const create = await h.request("/guest/create", {
    method: "POST",
    data: { name: "视觉验收宿舍", nickname: "小林", members: ["小陈", "小王"] },
  });
  assert.equal(create.status, 201);
  const room = await create.json();
  const params = `invite_code=${room.invite_code}&member_id=${room.member_id}`;
  const board = async () => {
    const r = await h.request("/chores/board?" + params, {
      token: room.access_token,
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const initial = await board(),
    waterId = initial.water_task.id;
  const html = path.join(front, name + ".html"),
    vue = path.join(front, name + ".vue");
  await fs.writeFile(
    html,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import {createApp} from 'vue';import {createRouter,createWebHistory} from 'vue-router';import {Icon} from 'vant';import Root from './${name}.vue';import './src/style.css';import './src/focus.css';import 'vant/es/dialog/style/index.mjs';import 'vant/es/toast/style/index.mjs';const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});createApp(Root).use(router).use(Icon).mount('#app')</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{computed}from'vue';import{useRoute}from'vue-router';import Board from './src/components/ChoreBoard.vue';import Nav from './src/components/ChoreBottomNav.vue';import{activityStreak}from'./src/interaction/activity';const route=useRoute();const section=computed(()=>route.path==='/water'?'water':route.path==='/calendar'?'calendar':'duty');(window as any).qa={streak:activityStreak};</script><template><main class="guest-page" style="max-width:520px;padding:24px 24px 120px;margin:auto;background:#fff;min-height:100vh"><Board :invite='${JSON.stringify(room.invite_code)}' dorm-name="视觉验收宿舍" :member-id="${room.member_id}" token="${room.access_token}" :demo="false" :section="section"/><Nav :section="section"/></main></template>`,
  );
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  server = spawn(
    process.execPath,
    [
      path.join(front, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: front, stdio: "ignore" },
  );
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/" + name + ".html")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const safari = process.env.DORM_BROWSER === "webkit";
  browser = await (safari ? webkit : chromium).launch({
    headless: true,
    ...(!safari && process.platform === "darwin"
      ? {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  let failComplete = false;
  await page.route("**/chores/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (failComplete && url.pathname.endsWith("/complete")) {
      failComplete = false;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: { message: "任务已变化，请刷新" } }),
      });
    }
    const response = await h.request(url.pathname + url.search, {
      method: req.method(),
      token: req.headers().authorization?.replace("Bearer ", ""),
      ...(req.postData() ? { data: JSON.parse(req.postData()) } : {}),
    });
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  await page.goto(origin + "/" + name + ".html");
  await page.getByTestId("pane-duty").waitFor();
  check(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ui-press-time")
        .trim(),
    ),
    "90ms",
    "global press token imported",
  );
  for (const width of [320, 390, 430, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `${width}px no horizontal overflow`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const main = page.getByTestId("pane-duty");
  check(
    await main.locator(".quiet-task-card").count(),
    1,
    "one focused task card",
  );
  check(
    await main.locator(".quiet-task-copy>p,.quiet-task-copy>button").count(),
    3,
    "three fixed rows",
  );
  check(
    await main.locator("h1").evaluate((e) => getComputedStyle(e).fontSize),
    "32px",
    "heading uses type token",
  );
  check(
    await main.locator(".completion-surface").evaluate((e) => e.offsetHeight),
    50,
    "full-width action is 50px tall",
  );
  check(
    await main
      .locator(".quiet-task-card")
      .evaluate((e) => getComputedStyle(e).boxShadow),
    "none",
    "task card has no shadow",
  );
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-duty.png`),
  });
  const task = initial.today_tasks[0];
  failComplete = true;
  await page.getByTestId(`complete-circle-${task.id}`).click();
  await page.getByRole("alert").getByText("任务已变化，请刷新").waitFor();
  check(
    await page.locator(".completion-particles").count(),
    0,
    "failed completion never celebrates",
  );
  await page.getByTestId(`complete-circle-${task.id}`).click();
  await page.getByTestId("completion-toast").waitFor();
  await page.waitForTimeout(850);
  check(
    (await board()).today_tasks.find((t) => t.id === task.id).status,
    "completed",
    "circle directly persists completion",
  );
  check(
    await page.locator(".p0-completed").getAttribute("open"),
    null,
    "completed group starts collapsed",
  );
  await page.locator(".p0-completed summary").click();
  await page.locator(".p0-completed .is-completed .quiet-task-title").waitFor();
  check(
    await page
      .locator(".p0-completed .quiet-task-title")
      .evaluate((e) =>
        getComputedStyle(e).textDecorationLine.includes("line-through"),
      ),
    true,
    "completed title struck through",
  );
  await page
    .getByTestId("completion-toast")
    .getByRole("button", { name: "撤销", exact: true })
    .click();
  await page.getByTestId(`complete-circle-${task.id}`).waitFor();
  check(
    (await board()).today_tasks.find((t) => t.id === task.id).status,
    "pending",
    "toast Undo restores task",
  );
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("calendar-view-stats").click();
  await page.getByTestId("activity-summary").waitFor();
  check(
    await page.locator(".activity-month").count(),
    3,
    "three actual calendar months in heatmap",
  );
  check(
    await page.locator(".stat-card").count(),
    4,
    "four category statistics cards",
  );
  check(
    await page.evaluate(() =>
      window.qa.streak(
        ["2026-10-12", "2026-10-13", "2026-10-15"],
        "2026-10-16",
      ),
    ),
    { current: 1, longest: 2 },
    "current and longest streak handle gaps",
  );
  check(
    await page.evaluate(() => window.qa.streak(["2026-10-12"], "2026-10-16")),
    { current: 0, longest: 1 },
    "inactive streak is zero",
  );
  await page.getByTestId("history-add").click();
  const editor = page.getByRole("dialog", { name: "补记完成", exact: true });
  await editor.waitFor();
  const yesterday = new Date(initial.today + "T12:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const day = yesterday.toISOString().slice(0, 10);
  await editor.getByLabel("任务", { exact: true }).selectOption("water");
  await editor.getByLabel("完成时间", { exact: true }).fill(day + "T12:00");
  await editor.getByLabel("原因", { exact: true }).fill("补记昨天抬水");
  await editor.getByRole("button", { name: "保存补记", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  const after = await board();
  check(
    after.water_task.id,
    waterId,
    "historical water backfill preserves live water turn",
  );
  const record = after.calendar.find((r) => r.id < 0);
  assert(record);
  await page.getByTestId("calendar-view-list").click();
  check(
    await page.locator(".recent-days button").count(),
    5,
    "five day activity strip",
  );
  await page.getByTestId(`record-group-${day}`).click();
  await page
    .getByRole("button", { name: "修正小林的抬水记录", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "修正记录", exact: true });
  await edit.waitFor();
  await edit.getByText("修正记录 · 1", { exact: true }).waitFor();
  await edit.getByLabel("完成时间", { exact: true }).fill(day + "T13:20");
  await edit.getByLabel("原因", { exact: true }).fill("修正完成时间");
  await edit.getByRole("button", { name: "保存修正", exact: true }).click();
  await edit.waitFor({ state: "hidden" });
  check(
    (await board()).calendar
      .find((r) => r.id === record.id)
      .completed_at.endsWith("05:20:00.000Z"),
    true,
    "history editor saves China timezone correctly",
  );
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-history.png`),
    fullPage: true,
  });
  await page.getByTestId("calendar-view-stats").click();
  await page.getByTestId("activity-summary").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(
      evidence,
      `${safari ? "webkit" : "chromium"}-statistics.png`,
    ),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("nav-duty").click();
  await page.getByTestId("pane-duty").waitFor();
  check(
    await page
      .locator(".p0-task-page")
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
    0,
    "reduced motion renders final state",
  );
  check(errors, [], "no uncaught browser errors");
  const report = {
    status: "passed",
    browser: safari ? "WebKit" : "Chromium",
    checks,
    scope:
      "isolated frontend + real backend API; no physical device validation",
  };
  await fs.writeFile(
    path.join(evidence, `${safari ? "webkit" : "chromium"}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: "passed",
      checks: checks.length,
      browser: report.browser,
    }),
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  h.close();
  await Promise.all([
    fs.rm(path.join(front, name + ".html"), { force: true }),
    fs.rm(path.join(front, name + ".vue"), { force: true }),
  ]);
}

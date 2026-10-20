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
const evidence = path.join(root, "docs/evidence/focus-compact"),
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
  const seedDay = new Date();
  seedDay.setUTCDate(seedDay.getUTCDate() - 3);
  const seedDate = seedDay.toISOString().slice(0, 10);
  for (let i = 0; i < 7; i++) {
    const b = await board();
    const result = await h.request("/chores/history", {
      token: room.access_token,
      method: "POST",
      data: {
        version: b.version,
        member_id: room.member_id,
        key: "floor",
        completed_at: `${seedDate}T12:0${i}:00+08:00`,
        reason: "隔离界面验收数据",
      },
    });
    assert.equal(result.status, 201);
  }
  const initial = await board(),
    waterId = initial.water_task.id;
  const configured = await h.request("/chores/settings", {
    token: room.access_token,
    method: "PATCH",
    data: {
      version: initial.version,
      categories: [{ key: "floor", reminder_interval_days: 2 }],
    },
  });
  assert.equal(configured.status, 200);
  const html = path.join(front, name + ".html"),
    vue = path.join(front, name + ".vue");
  await fs.writeFile(
    html,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import {createApp} from 'vue';import {createRouter,createWebHistory} from 'vue-router';import {Icon} from 'vant';import Root from './${name}.vue';import './src/style.css';import './src/focus.css';import 'vant/es/dialog/style/index.mjs';import 'vant/es/toast/style/index.mjs';const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});createApp(Root).use(router).use(Icon).mount('#app')</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{computed}from'vue';import{useRoute}from'vue-router';import Board from './src/components/ChoreBoard.vue';import Nav from './src/components/ChoreBottomNav.vue';import{activityStreak}from'./src/interaction/activity';const route=useRoute();const section=computed(()=>route.path==='/water'?'water':route.path==='/calendar'?'calendar':'duty');(window as any).qa={streak:activityStreak};</script><template><main class="guest-page" style="max-width:520px;padding:12px 20px 0;margin:auto;background:#fff;min-height:100svh;box-sizing:border-box"><Board :invite='${JSON.stringify(room.invite_code)}' dorm-name="视觉验收宿舍" :member-id="${room.member_id}" token="${room.access_token}" :demo="false" :section="section"/><Nav :section="section"/></main></template>`,
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
  await page.route("**/marks/*.svg", (route) => route.abort());
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
    0,
    "duty restores the plain large-type layout",
  );
  check(
    await main
      .locator(".task-title-stage h2")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 48),
    true,
    "task remains the large visual focus",
  );
  check(
    await main.locator(".completion-surface").evaluate((el) => el.offsetHeight),
    56,
    "restored focused action is 56px tall",
  );
  await page.waitForTimeout(120);
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-duty.png`),
  });
  const task = initial.today_tasks[0];
  failComplete = true;
  await page.getByTestId(`complete-${task.key}-${task.id}`).click();
  await page.getByRole("alert").getByText("任务已变化，请刷新").waitFor();
  check(
    await page.locator(".completion-particles").count(),
    0,
    "failed completion never celebrates",
  );
  check(
    await page.getByTestId("completion-toast").count(),
    0,
    "failed completion never shows encouragement",
  );
  await page.getByTestId(`complete-${task.key}-${task.id}`).click();
  const praise = page.getByTestId("completion-toast");
  await praise.waitFor();
  check(
    (await praise.innerText()).trim(),
    "你真棒👍！",
    "successful completion uses the requested quiet encouragement",
  );
  check(
    await praise.locator("button").count(),
    0,
    "encouragement has no extra controls",
  );
  check(
    await praise.evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
    "encouragement has no toast background",
  );
  check(
    await praise.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        nav = document
          .querySelector(".chore-bottom-nav")
          .getBoundingClientRect(),
        action = document
          .querySelector(".completion-surface")
          .getBoundingClientRect();
      return (
        r.bottom < nav.top - 10 &&
        (r.top >= action.bottom || r.bottom <= action.top)
      );
    }),
    true,
    "encouragement fits the empty area above navigation without overlapping the action",
  );
  await page.waitForTimeout(850);
  check(
    (await board()).today_tasks.find((t) => t.id === task.id).status,
    "completed",
    "main action persists completion",
  );
  check(
    await page.getByTestId(`undo-${task.id}`).isVisible(),
    true,
    "completed task keeps its reversible button",
  );
  await page.screenshot({
    path: path.join(
      evidence,
      `${safari ? "webkit" : "chromium"}-completion-praise.png`,
    ),
  });
  await page.getByTestId(`undo-${task.id}`).click();
  await page.getByTestId(`complete-${task.key}-${task.id}`).waitFor();
  check(
    (await board()).today_tasks.find((t) => t.id === task.id).status,
    "pending",
    "tapping the completed button still restores the task",
  );
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("calendar-view-stats").click();
  await page.getByTestId("activity-summary").waitFor();
  check(
    await page.locator(".activity-month").count(),
    0,
    "heatmap is no longer a separate tall section",
  );
  check(
    await page.locator(".stat-card").count(),
    4,
    "four statistics cards retained in the deck",
  );
  check(
    await page.locator(".deck-card:not([inert])").count(),
    1,
    "only one statistics card accepts interaction",
  );
  check(
    await page.getByTestId("stats-floor").getAttribute("data-tone"),
    "warm",
    "task-specific interval colors the elapsed-time card",
  );
  check(
    await page.getByTestId("stats-toilet").getAttribute("data-tone"),
    "empty",
    "missing history is not marked overdue",
  );
  check(
    await page
      .locator(".calendar-task-mark,.calendar-more,.day-record-dots")
      .count(),
    0,
    "calendar hides tiny people and task markers",
  );
  check(
    await page
      .getByRole("button", { name: "下一张统计卡片", exact: true })
      .count(),
    0,
    "statistics has no arrow controls",
  );
  await page.getByRole("button", { name: "设置间隔", exact: true }).click();
  const intervalSheet = page.getByRole("dialog", {
    name: "宿舍任务设置",
    exact: true,
  });
  await intervalSheet.waitFor();
  await page.getByTestId("settings-interval-floor").fill("365");
  await intervalSheet
    .getByRole("button", { name: "保存设置", exact: true })
    .click();
  await intervalSheet.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="stats-floor"]')
        ?.getAttribute("data-tone") === "neutral",
  );
  check(
    (await board()).categories.find((c) => c.key === "floor")
      .reminder_interval_days,
    365,
    "creator saves a per-task interval from statistics",
  );
  await page.getByRole("button", { name: "设置间隔", exact: true }).click();
  await page.getByTestId("settings-interval-floor").fill("2");
  await intervalSheet
    .getByRole("button", { name: "保存设置", exact: true })
    .click();
  await intervalSheet.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="stats-floor"]')
        ?.getAttribute("data-tone") === "warm",
  );
  const touchSession =
    process.env.DORM_TOUCH === "1" && !safari
      ? await page.context().newCDPSession(page)
      : null;
  async function swipeCard(direction = -1) {
    const bounds = await page.locator(".deck-stage").boundingBox();
    const x = bounds.x + bounds.width * (direction < 0 ? 0.8 : 0.2),
      y = bounds.y + bounds.height * 0.5;
    if (touchSession) {
      await touchSession.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let i = 1; i <= 12; i++) {
        await touchSession.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: x + (direction * bounds.width * 0.64 * i) / 12, y, id: 1 },
          ],
        });
        await page.waitForTimeout(16);
      }
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + direction * bounds.width * 0.64, y, {
        steps: 12,
      });
    }
    check(
      await page
        .locator(".deck-card.is-front")
        .evaluate(
          (e) =>
            Math.abs(new DOMMatrix(getComputedStyle(e).transform).m41) > 10,
        ),
      true,
      "stacked front card follows the pointer before release",
    );
    const weights = await page
      .locator(".deck-dot-fill")
      .evaluateAll((els) =>
        els.map((e) => Number(getComputedStyle(e).opacity)),
      );
    check(
      weights.filter((v) => v > 0.01 && v < 0.99).length,
      2,
      "adjacent pagination dots crossfade continuously during the gesture",
    );
    if (touchSession)
      await touchSession.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    else await page.mouse.up();
    await page.waitForTimeout(500);
    check(
      await page
        .locator(".deck-dots .is-current .deck-dot-fill")
        .evaluate((e) => Number(getComputedStyle(e).opacity)),
      1,
      "pagination dots settle on the visible card",
    );
  }
  await swipeCard(1);
  check(
    await page.locator(".deck-card.is-front h2").innerText(),
    "抬水",
    "rightward gesture wraps from the first card",
  );
  await swipeCard(-1);
  check(
    await page.locator(".deck-card.is-front h2").innerText(),
    "地板",
    "leftward gesture wraps back to the first card",
  );
  await swipeCard();
  check(
    await page.locator(".deck-card.is-front h2").innerText(),
    "厕所",
    "swipe changes the focused card",
  );
  await swipeCard();
  check(
    await page.locator(".deck-card.is-front h2").innerText(),
    "洗手池",
    "successive swipe changes the focused card",
  );
  check(
    new URL(page.url()).pathname,
    "/calendar",
    "statistics card swipe never changes the bottom page",
  );

  await page.getByTestId("calendar-view-grid").click();
  await page.getByTestId(`calendar-day-${seedDate}`).click();
  const detailLayer = page.locator(".sheet-layer");
  check(
    await detailLayer.getAttribute("data-motion"),
    "bottom",
    "date detail explicitly uses a bottom drawer",
  );
  const detail = page.getByTestId("calendar-day-details");
  const incoming = await detail
    .locator(".record-stagger")
    .evaluateAll((els) =>
      els
        .slice(0, 3)
        .map((el) => ({
          opacity: Number(getComputedStyle(el).opacity),
          x: new DOMMatrix(getComputedStyle(el).transform).m41,
          delay: parseFloat(getComputedStyle(el).transitionDelay),
        })),
    );
  check(
    incoming.some((r) => r.opacity < 1 && r.x > 0),
    true,
    "drawer cards appear with a fade and right-to-left movement",
  );
  check(
    incoming[2].delay > incoming[1].delay &&
      incoming[1].delay > incoming[0].delay,
    true,
    "drawer entrance is progressively staggered",
  );
  await page.waitForTimeout(600);
  const finalRecord = detail.locator(".record-stagger").last();
  await finalRecord.scrollIntoViewIfNeeded();
  check(
    await detail.locator("img.member-mark").count(),
    0,
    "record markers never depend on image loads",
  );
  check(
    await detail.locator("svg.member-mark path").count(),
    7,
    "all markers survive deliberately blocked image requests",
  );
  check(
    await finalRecord.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        b = el.closest(".sheet-content").getBoundingClientRect();
      return r.bottom <= b.bottom + 1 && r.top >= b.top;
    }),
    true,
    "last record is fully visible inside the drawer scroll area",
  );
  await page.screenshot({
    path: path.join(
      evidence,
      `${safari ? "webkit" : "chromium"}-details-bottom.png`,
    ),
  });
  await detailLayer
    .getByRole("button", { name: "关闭详情", exact: true })
    .click();
  check(
    await detail.count(),
    1,
    "drawer retains its cards during the exit animation",
  );
  await detailLayer.waitFor({ state: "detached" });

  for (const [width, height] of [
    [320, 568],
    [390, 667],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(80);
    for (const [testId, label] of [
      ["calendar-view-grid", "calendar"],
      ["calendar-view-list", "list"],
      ["calendar-view-stats", "stats"],
    ]) {
      await page.getByTestId(testId).click();
      await page.waitForTimeout(80);
      const fit = await page.evaluate(() => {
        const root = document
            .querySelector(".compact-calendar")
            .getBoundingClientRect(),
          nav = document
            .querySelector(".chore-bottom-nav")
            .getBoundingClientRect();
        return {
          bottom: root.bottom,
          nav: nav.top,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      check(
        fit.bottom <= fit.nav + 1 && !fit.overflow,
        true,
        `${label} fits ${width}x${height} above navigation`,
      );
      if (width === 390 && height === 844 && label === "calendar") {
        await page.waitForTimeout(350);
        await page.screenshot({
          path: path.join(
            evidence,
            `${safari ? "webkit" : "chromium"}-calendar.png`,
          ),
        });
      }
      if (width === 320 && height === 568) {
        await page.waitForTimeout(150);
        await page.screenshot({
          path: path.join(
            evidence,
            `${safari ? "webkit" : "chromium"}-${label}-small.png`,
          ),
        });
      }
      if (label === "stats")
        check(
          await page
            .locator(".deck-card.is-front .stat-card")
            .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
          true,
          `all statistics metrics fit ${width}x${height}`,
        );
      if (label === "stats")
        check(
          await page
            .locator(".deck-card.is-front footer")
            .evaluate(
              (el) =>
                el.getBoundingClientRect().bottom <=
                el.closest(".deck-card-face").getBoundingClientRect().bottom +
                  1,
            ),
          true,
          `last-completion time is not clipped at ${width}x${height}`,
        );
      if (label === "calendar")
        check(
          await page
            .locator(
              `.month-page[data-month="${initial.today.slice(0, 7)}"] .chore-calendar-grid`,
            )
            .evaluate(
              (el) =>
                el.getBoundingClientRect().bottom <=
                document
                  .querySelector(".calendar-surface")
                  .getBoundingClientRect().bottom,
            ),
          true,
          `six calendar rows fit ${width}x${height}`,
        );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
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
  const record = after.calendar.find((r) => r.id < 0 && r.key === "water");
  assert(record);
  await page.getByTestId("calendar-view-list").click();
  check(
    await page.locator(".recent-days").count(),
    0,
    "list removes the top count strip",
  );
  const seedHeading=page.getByTestId(`record-group-${seedDate}`);
  await seedHeading.click();
  const seedStack=seedHeading.locator('..');
  const listEntrance=await seedStack.locator('.record-stagger').evaluateAll(els=>els.slice(0,3).map(el=>({opacity:Number(getComputedStyle(el).opacity),x:new DOMMatrix(getComputedStyle(el).transform).m41,delay:parseFloat(getComputedStyle(el).transitionDelay)})));
  check(listEntrance.some(r=>r.opacity<1&&r.x>0),true,'expanded list cards fade in from right to left');
  check(listEntrance[2].delay>listEntrance[1].delay,true,'expanded list cards enter progressively');
  await page.waitForTimeout(600);
  const expandedHeight=await seedStack.locator('.record-stack-body').evaluate(e=>e.getBoundingClientRect().height);
  await seedHeading.click();
  check(await seedStack.locator('.record-stack-body').evaluate((e,h)=>e.getBoundingClientRect().height>=h-1,expandedHeight),true,'collapse retains its scroll extent while cards are still visible');
  const exits=await seedStack.locator('.record-reveal-leave-active').evaluateAll(els=>els.map(el=>Number.parseFloat(el.style.top)));
  check(exits.length,7,'collapse keeps each card for its exit animation');
  check(exits.every((y,i)=>Number.isFinite(y)&&(i===0||y>exits[i-1])),true,'collapsing cards preserve distinct old positions');
  const foldingFrames = await seedStack.evaluate(async el => {
    const frames=[],started=performance.now();
    while(performance.now()-started<430){
      await new Promise(requestAnimationFrame);
      frames.push({rows:[...el.querySelectorAll('.record-stagger')].map(row=>{
        const css=getComputedStyle(row),m=new DOMMatrix(css.transform);
        return {opacity:Number(css.opacity),x:m.m41,y:m.m42};
      }),depth:Number(getComputedStyle(el,'::after').opacity)});
    }
    return frames;
  });
  check(foldingFrames.some(f=>f.rows.some(r=>r.opacity>.05&&r.opacity<.95&&r.x>1&&r.y< -1)),true,'collapse visibly fades and moves cards back towards the stack');
  check(foldingFrames.some(f=>f.rows.length>2&&Math.abs(f.rows[0].opacity-f.rows[f.rows.length-1].opacity)>.1),true,'collapse uses a progressive exit instead of removing every card together');
  check(foldingFrames.some(f=>f.depth>0&&f.depth<1),true,'closed stack depth fades into place instead of popping in');
  check(await seedStack.locator('.record-stagger').count(),0,'collapse leaves no ghost cards');
  check(await seedStack.locator('.record-stack-body').evaluate(e=>e.style.minHeight),'','collapse releases its temporary scroll reservation');
  await seedHeading.click();await page.waitForTimeout(50);await seedHeading.click();await page.waitForTimeout(50);await seedHeading.click();await page.waitForTimeout(600);
  check(await seedStack.locator('.record-stagger').evaluateAll(els=>els.length===7&&els.every(e=>getComputedStyle(e).opacity==='1'&&!e.style.top)),true,'interrupted collapse reopens all cards at their natural positions');
  await seedHeading.click();await seedStack.locator('.record-stagger').first().waitFor({state:'detached'});
  check(await seedStack.locator('.record-stagger').count(),0,'repeated collapse does not leave stale cards');
  const seen = new Set();
  while(true){
    for(const heading of await page.locator('.records-heading').all()){
      if(await heading.getAttribute('aria-expanded')==='false')await heading.click();
    }
    await page.waitForTimeout(420);
    for(const row of await page.locator('[data-testid^="calendar-list-record-"]').all())seen.add(await row.getAttribute('data-testid'));
    const next=page.getByRole('button',{name:'下一页记录',exact:true});
    if(!await next.count()||!await next.isEnabled())break;
    await next.click();
  }
  check(seen.size,after.calendar.length,'folded date groups retain every historical record');
  const previous=page.getByRole('button',{name:'上一页记录',exact:true});
  while(await previous.count()&&await previous.isEnabled())await previous.click();
  for(const heading of await page.locator('.records-heading').all())if(await heading.getAttribute('aria-expanded')==='false')await heading.click();
  await page.getByTestId(`calendar-list-record-${record.id}`).getByRole('button',{name:'修正小林的抬水记录',exact:true}).click();
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
      .getByTestId("pane-duty")
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

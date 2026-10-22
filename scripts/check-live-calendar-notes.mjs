// Actual Vue components in a disposable dorm. No real accounts or notifications.
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
  name = `live-calendar-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue"),
  evidence = path.join(root, "docs/evidence/live-calendar");
const h = await createHarness(),
  checks = [],
  errors = [];
let browser, server;
const check = (condition, label) => {
  assert(condition, label);
  checks.push(label);
};
try {
  const room = await (
    await h.request("/guest/create", {
      method: "POST",
      data: { name: "交互验收", nickname: "甲", members: ["乙", "丙"] },
    })
  ).json();
  const board = async () =>
    await (
      await h.request(
        `/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`,
        { token: room.access_token },
      )
    ).json();
  // A pre-existing date correction survives undo on the same floor task ID.
  // This mirrors the production incident without touching real history.
  const priorBoard = await board(),
    priorFloor = priorBoard.today_tasks.find((t) => t.key === "floor");
  await h.request(`/chores/tasks/${priorFloor.id}/complete`, {
    method: "PATCH",
    token: room.access_token,
    data: {},
  });
  const correctedBoard = await board();
  const correctionDate = new Date(Date.now() - 4 * 86400000)
    .toISOString()
    .slice(0, 10);
  await h.request("/chores/history", {
    method: "PATCH",
    token: room.access_token,
    data: {
      id: priorFloor.id,
      revision: 0,
      version: correctedBoard.version,
      completed_at: correctionDate + "T12:00:00+08:00",
      reason: "旧地板修正隔离复现",
    },
  });
  await h.request(`/chores/tasks/${priorFloor.id}/undo`, {
    method: "PATCH",
    token: room.access_token,
    data: {},
  });
  h.db.sqlite
    .prepare("UPDATE chore_history_entries SET updated_at=? WHERE task_id=?")
    .run(correctionDate + "T06:00:00.000Z", priorFloor.id);
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fff"><div id="app"></div>${["rings", "emotions", "ball", "engine"].map((n) => `<script src="/vendor/emotion-ball/${n}.js"></script>`).join("")}<script type="module">import{createApp}from'vue';import{createPinia}from'pinia';import{createRouter,createWebHistory}from'vue-router';import{Icon}from'vant';import Root from'./${name}.vue';import'vant/es/icon/style/index.mjs';import'./src/theme.css';import'./src/screen.css';import'./src/style.css';import'./src/focus.css';import{installTheme}from'./src/interaction/theme';installTheme();const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});window.qaRoutes=[];router.afterEach(to=>window.qaRoutes.push(to.path));createApp(Root).use(createPinia()).use(router).use(Icon).mount('#app');</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{computed,ref,nextTick}from'vue';import{useRoute}from'vue-router';import Stage from'./src/components/ScreenStage.vue';import Board from'./src/components/ChoreBoard.vue';import Nav from'./src/components/ChoreBottomNav.vue';import Deck from'./src/components/SwipeCardDeck.vue';import{setThemeMode}from'./src/interaction/theme';const route=useRoute(),current=ref(0),deckVisible=ref(true),deckMemory={pausedUntil:0};const section=computed(()=>route.path==='/calendar'?'calendar':route.path==='/water'?'water':'duty');(window as any).qa={theme:setThemeMode,remount:async()=>{deckVisible.value=false;await nextTick();deckVisible.value=true;}};</script><template><div v-if="route.query.deck" style="height:360px;padding:30px"><Deck v-if="deckVisible" v-model="current" :autoplay-memory="deckMemory" :labels="['一','二','三','四']" label="自动切换验收" autoplay :autoplay-delay="600" :resume-delay="1800"><template #default="{index}"><h2>{{index}}</h2></template></Deck></div><template v-else><Stage signed-in><main class="guest-page"><Board invite="${room.invite_code}" dorm-name="交互验收" :member-id="${room.member_id}" token="${room.access_token}" :demo="false" :section="section"/></main></Stage><Nav :section="section"/></template></template><style>.swipe-card-deck .deck-stage{min-height:180px}</style>`,
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
  const origin = `http://127.0.0.1:${port}`,
    url = origin + "/" + name + ".html";
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
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
    hasTouch: true,
    isMobile: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  let failBoard = false;
  await page.route("**/chores/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      r = await h.request(u.pathname + u.search, {
        method: req.method(),
        token: req.headers().authorization?.replace("Bearer ", ""),
        ...(req.postData() ? { data: JSON.parse(req.postData()) } : {}),
      });
    if (u.pathname === "/chores/board" && failBoard) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { message: "隔离读失败" } }),
      });
    }
    if (u.pathname.endsWith("/complete") && r.status === 200) failBoard = true;
    await route.fulfill({
      status: r.status,
      contentType: "application/json",
      body: await r.text(),
    });
  });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === "webgl" ? null : get.call(this, kind, ...args);
    };
  });
  let calendarCodeRequested = false;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/ChoreCalendar.vue"))
      calendarCodeRequested = true;
  });
  await page.goto(url);
  await page.getByTestId("pane-duty").waitFor();
  const initial = await board(),
    task = initial.today_tasks.find((t) => t.key === "floor");
  await page.getByTestId(`complete-floor-${task.id}`).click();
  await page.waitForTimeout(1100);
  check(
    failBoard,
    "completion was acknowledged before simulated refresh failure",
  );
  check(
    calendarCodeRequested,
    "calendar code is warmed while duty is idle, before any calendar navigation",
  );
  await page.evaluate(() => {
    window.qaRoutes.length = 0;
    window.qaLens = [];
    window.qaCalendarFrames = [];
    const start = performance.now();
    function frame() {
      const el = document.querySelector(".nav-selection");
      const matrix =
        el && new DOMMatrixReadOnly(getComputedStyle(el).transform);
      window.qaLens.push(
        matrix ? matrix.m41 / el.getBoundingClientRect().width : null,
      );
      const calendar = document.querySelector(
        ".calendar-page:not([inert]) .calendar-mode",
      );
      if (calendar) {
        const style = getComputedStyle(calendar);
        window.qaCalendarFrames.push({
          opacity: Number(style.opacity),
          translate: style.translate,
          scale: Number(style.scale),
          durations: calendar
            .getAnimations()
            .map((a) => a.effect.getTiming().duration),
        });
      }
      if (performance.now() - start < 700) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("calendar-view-grid").waitFor();
  await page.waitForTimeout(750);
  const entryFrames = await page.evaluate(() => window.qaCalendarFrames);
  check(
    entryFrames.some(
      (f) =>
        f.opacity > 0 &&
        f.opacity < 1 &&
        parseFloat(f.translate.split(" ").at(-1)) > 0 &&
        f.scale > 0.97 &&
        f.scale < 1,
    ),
    "the actual async calendar has visible opacity and movement between its entrance endpoints",
  );
  check(
    entryFrames.some((f) => f.durations.includes(300)) &&
      entryFrames.at(-1).opacity === 1 &&
      entryFrames.at(-1).durations.length === 0,
    "calendar layers enter progressively and settle at full opacity",
  );
  check(
    (await page.evaluate(() => window.qaLens)).some((p) => p > 0.2 && p < 1.8),
    "non-adjacent lens glides through the middle tab while route stays direct",
  );
  check(
    JSON.stringify(await page.evaluate(() => window.qaRoutes)) ===
      JSON.stringify(["/calendar"]),
    "direct first-to-third navigation never mounts water route",
  );
  check(
    (await page
      .getByTestId(`calendar-day-${initial.today}`)
      .getAttribute("data-heat")) === "1",
    "calendar heat updates immediately even when post-completion read fails",
  );
  await page.getByTestId(`calendar-day-${initial.today}`).click();
  await page.locator(".elastic-sheet").last().waitFor();
  check(
    (await page.locator(".elastic-sheet").last().textContent()).includes(
      "地板",
    ),
    "day drawer contains the newly completed task without manual reload",
  );
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-day.png`),
  });
  // Close only the day drawer, return to the task, and restore normal reads.
  await page
    .locator(".elastic-sheet")
    .last()
    .getByRole("button", { name: /关闭/ })
    .click();
  failBoard = false;
  check(
    (await board()).calendar.some(
      (r) => r.id === task.id && r.completed_date === initial.today,
    ),
    "server projection keeps re-completed floor today despite an old correction",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(500);
  await page.getByTestId("nav-duty").click();
  await page.waitForTimeout(700);
  await page.getByTestId(`undo-${task.id}`).click();
  await page.waitForTimeout(500);
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId(`calendar-day-${initial.today}`).waitFor();
  check(
    (await page
      .getByTestId(`calendar-day-${initial.today}`)
      .getAttribute("data-heat")) === "0",
    "undo clears calendar heat and neighbor copies",
  );
  await page.getByTestId("nav-duty").click();
  await page.waitForTimeout(450);
  await page.locator(".dorm-companion").click();
  await page.getByRole("button", { name: "我要留言", exact: true }).click();
  const note = page.getByTestId("conversation-note");
  await note.getByRole("button", { name: "所有人", exact: true }).click();
  await page.getByLabel("和球球说句话", { exact: true }).click();
  await page.getByLabel("和球球说句话", { exact: true }).fill("今晚一起打扫。");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  check(
    h.db.sqlite
      .prepare("SELECT COUNT(*) n FROM chore_reminders WHERE source='note'")
      .get().n === 0,
    "broadcast preview does not send before explicit confirmation",
  );
  await note.getByRole("button", { name: "确认发送", exact: true }).click();
  await note.waitFor({ state: "hidden" });
  const delivered = h.db.sqlite
    .prepare(
      "SELECT target_member_id,task_content_snapshot FROM chore_reminders WHERE source='note'",
    )
    .all();
  check(
    delivered.length === 2 &&
      delivered.every(
        (n) =>
          n.target_member_id !== room.member_id &&
          n.task_content_snapshot === "今晚一起打扫。",
      ),
    "all-recipient composer delivers once to each other roommate",
  );
  // A very early tap can outrun idle warming. The real async content must
  // still own its entrance, even when the loading placeholder has settled.
  await page.addInitScript(() => {
    window.qaCalendarRuns = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = original.call(this, frames, options);
      if (
        this.matches(
          ".chore-calendar > header,.calendar-view-selector,.calendar-mode",
        )
      )
        window.qaCalendarRuns.push({ frames, duration: options.duration });
      return animation;
    };
  });
  await page.route(/\/src\/components\/ChoreCalendar\.vue$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto(url);
  await page.getByTestId("pane-duty").waitFor();
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("chore-calendar").waitFor();
  const cold = await page.evaluate(() => window.qaCalendarRuns);
  check(
    cold.length >= 3 &&
      cold[0].duration === 300 &&
      cold[0].frames[0].opacity === 0,
    "slow first-load calendar animates its real content once after the placeholder, rather than popping in",
  );
  await page.getByTestId("nav-duty").click();
  await page.getByTestId("pane-duty").waitFor();
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("nav-duty").click();
  await page.waitForTimeout(350);
  check(
    (await page.locator(".focus-pane:not([inert])").count()) === 1 &&
      (await page.locator(".focus-pane[inert]").count()) === 0,
    "rapid calendar reversals leave one active page and release departing layers",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("chore-calendar").waitFor();
  check(
    (await page
      .getByTestId("chore-calendar")
      .evaluate((el) => el.getAnimations({ subtree: true }).length)) === 0,
    "reduced motion renders the calendar immediately without an entrance animation",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByTestId("nav-duty").click();
  await page.getByTestId("pane-duty").waitFor();
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("chore-calendar").waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(40);
  check(
    (await page
      .getByTestId("chore-calendar")
      .evaluate((el) => el.getAnimations().length)) === 0,
    "enabling reduced motion during entrance cancels the running calendar layer",
  );
  check(errors.length === 0, "no browser errors");
  console.log(
    JSON.stringify({
      status: "passed",
      browser: safari ? "WebKit" : "Chromium",
      checks,
    }),
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  h.close();
  await Promise.all([
    fs.rm(html, { force: true }),
    fs.rm(vue, { force: true }),
  ]);
}

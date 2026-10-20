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
  await page.evaluate(() => {
    window.qaRoutes.length = 0;
    window.qaLens = [];
    const start = performance.now();
    function frame() {
      const el = document.querySelector(".nav-selection");
      const matrix =
        el && new DOMMatrixReadOnly(getComputedStyle(el).transform);
      window.qaLens.push(
        matrix ? matrix.m41 / el.getBoundingClientRect().width : null,
      );
      if (performance.now() - start < 350) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("calendar-view-grid").waitFor();
  await page.waitForTimeout(450);
  check(
    !(await page.evaluate(() => window.qaLens)).some((p) => p > 0.2 && p < 1.8),
    "non-adjacent tap selection does not sweep through middle tab",
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
  await page.locator("#companion-note-text").waitFor();
  await page.getByRole("button", { name: "所有人", exact: true }).click();
  await page.locator("#companion-note-text").fill("今晚一起打扫。");
  await page.getByRole("button", { name: "送给所有人", exact: true }).click();
  await page.locator("#companion-note-text").waitFor({ state: "detached" });
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

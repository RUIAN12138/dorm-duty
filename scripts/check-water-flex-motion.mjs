// Real Vue components, isolated SQLite, real animation-frame samples.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
const front = new URL("../frontend/", import.meta.url).pathname,
  name = `water-flex-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue");
const h = await createHarness(),
  checks = [],
  errors = [];
const safari = process.env.DORM_BROWSER === "webkit";
let server, browser;
function check(value, label) {
  assert(value, label);
  checks.push(label);
}
async function api(route, token, data, method = data ? "POST" : "GET") {
  const r = await h.request(route, { token, data, method });
  assert(r.ok, JSON.stringify(await r.clone().json()));
  return r.json();
}
try {
  const room = await api("/guest/create", null, {
    name: "动效验收",
    nickname: "甲",
    members: ["乙", "丙", "丁", "戊", "己", "庚", "辛"],
  });
  const people = [];
  for (const m of room.dorm.members) {
    const c = await api("/chores/claim", null, {
      invite_code: room.invite_code,
      nickname: m.nickname,
    });
    people.push({ ...m, token: c.access_token });
  }
  const board = async (p = people[0]) =>
    api(
      `/chores/board?invite_code=${room.invite_code}&member_id=${p.user_id}`,
      p.token,
    );
  for (const p of people.slice(0, 4)) {
    const b = await board(p);
    await api(
      `/chores/tasks/${b.today_tasks.find((t) => t.key === "floor").id}/complete`,
      p.token,
      {},
      "PATCH",
    );
  }
  await fs.writeFile(
    html,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import{createApp}from'vue';import{createPinia}from'pinia';import{createRouter,createWebHistory}from'vue-router';import{Icon}from'vant';import Root from'./${name}.vue';import'./src/theme.css';import'./src/style.css';import'./src/focus.css';import'./src/screen.css';createApp(Root).use(createPinia()).use(Icon).use(createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]})).mount('#app');</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{computed,ref}from'vue';import{useRoute}from'vue-router';import Board from'./src/components/ChoreBoard.vue';import Stage from'./src/components/ScreenStage.vue';import Nav from'./src/components/ChoreBottomNav.vue';import Handoff from'./src/components/WaterHandoffName.vue';const route=useRoute(),key=ref(0),event=ref(null),active=ref(false);const section=computed(()=>route.path==='/calendar'?'calendar':route.path==='/water'?'water':'duty');(window as any).qa={key,event,active};</script><template><Stage signed-in><main class="guest-page"><Board :key="key" invite="${room.invite_code}" dorm-name="动效验收" :member-id="${room.member_id}" token="${people[0].token}" :demo="false" :section="section"/></main></Stage><Nav :section="section"/><div v-if="route.query.reel" style="position:fixed;top:180px;width:100%;font-size:60px"><Handoff :key="key" scope="water-flex-test" :event="event" :members='${JSON.stringify(people.map(({ token, ...m }) => m))}' :target-id="${people[2].user_id}" target-name="丙" :active="active"><span>丙</span></Handoff></div></template>`,
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
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(msg.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) console.error("HTTP", r.status(), r.url());
  });
  let activityRequests = 0;
  await page.route(
    (u) => u.pathname.startsWith("/chores/"),
    async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      if (u.pathname.endsWith("/chores/activity")) activityRequests++;
      const response = await h.request(
        u.pathname.replace(/^\/api/, "") + u.search,
        {
          method: req.method(),
          token: req.headers().authorization?.replace(/^Bearer /, ""),
          ...(req.postData() ? { data: JSON.parse(req.postData()) } : {}),
        },
      );
      await route.fulfill({
        status: response.status,
        headers: { "content-type": "application/json" },
        body: await response.text(),
      });
    },
  );
  await page.goto(url);
  await page.getByTestId("pane-duty").waitFor();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "地板", exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator(".round-progress").click();
  await page.locator(".round-ranking li").last().waitFor();
  await page.waitForTimeout(1400);
  const ring = page.locator(".has-fixed-content .round-progress-display"),
    list = page.locator(".round-ranking-viewport");
  const before = await ring.boundingBox();
  await list.evaluate((el) => {
    el.scrollTop = 60;
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: 60, bubbles: true }));
  });
  const frames = await ring.evaluate(async (el) => {
    const result = [];
    for (let i = 0; i < 32; i++) {
      await new Promise(requestAnimationFrame);
      const rect = el.getBoundingClientRect();
      result.push({
        width: rect.width,
        listTop: document
          .querySelector(".round-ranking-viewport")
          .getBoundingClientRect().top,
      });
    }
    return result;
  });
  check(
    new Set(frames.map((f) => f.width.toFixed(2))).size > 8,
    "ring compression has multiple real intermediate frames",
  );
  check(
    frames.at(-1).width < before.width * 0.6,
    "scrolling yields space to the names",
  );
  check(
    frames.at(-1).listTop < frames[0].listTop - 50,
    "names move upward together with the spring, without a blank reserved header",
  );
  await list.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -60, bubbles: true }));
  });
  await page.waitForTimeout(70);
  await list.evaluate((el) => {
    el.scrollTop = 40;
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: 60, bubbles: true }));
  });
  await page.waitForTimeout(60);
  await list.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -60, bubbles: true }));
  });
  await page.waitForTimeout(800);
  check(
    Math.abs((await ring.boundingBox()).width - before.width) < 1,
    "rapid scroll reversal restores the original ring without stale transforms",
  );
  await page.getByRole("button", { name: "未完成 4", exact: true }).click();
  await page.waitForTimeout(650);
  check(
    (await page.locator(".round-ranking li").count()) === 4,
    "pending filter shows the remaining members",
  );
  await page.getByRole("button", { name: "已完成 4", exact: true }).click();
  await page.waitForTimeout(650);
  check(
    (await page.locator(".round-ranking li").count()) === 4,
    "completed filter restores chronological ranks",
  );
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(100);
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px round has no horizontal overflow`,
    );
  }
  await page
    .getByRole("button", { name: "关闭详情", exact: true })
    .last()
    .click();
  await page.waitForTimeout(500);
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("calendar-view-stats").click();
  await page.getByTestId("activity-summary").waitFor();
  await page.waitForTimeout(500);
  const firstRequests = activityRequests;
  await page.getByTestId("nav-water").click();
  await page.getByTestId("pane-water").waitFor();
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("activity-summary").waitFor();
  await page.waitForTimeout(500);
  check(
    activityRequests === firstRequests,
    "re-entering statistics reuses the same identity/version snapshot without another request",
  );
  check(
    (await page.locator('[data-testid="loading-stats"]').count()) === 0,
    "cached statistics do not flash a placeholder on re-entry",
  );
  await page.getByTestId("calendar-view-list").click();
  const floorId = h.db.sqlite
    .prepare(
      "SELECT id FROM chore_tasks WHERE key='floor' AND assignee_id=? AND status='completed'",
    )
    .get(room.member_id).id;
  const cell = page.getByTestId(`calendar-list-record-${floorId}`);
  await cell.scrollIntoViewIfNeeded();
  await page.waitForTimeout(650);
  // A real touch cannot land on a row while its stagger/FLIP entrance still
  // moves underneath it. Wait for the front surface to own the hit point,
  // rather than treating a fixed delay as evidence it is ready on a slow GPU.
  const frontSurface = cell.locator(".swipe-record-front");
  await frontSurface.scrollIntoViewIfNeeded();
  await page.waitForFunction(async (id) => {
    const root = document.querySelector(`[data-testid="${id}"]`);
    const front = root?.querySelector(".swipe-record-front");
    if (!front) return false;
    const box = front.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.x + box.width * 0.7,
      box.y + box.height * 0.5,
    );
    const ready =
      !!hit &&
      front.contains(hit) &&
      !root.closest("[inert]") &&
      !root.querySelector(".swipe-undo:disabled") &&
      ![...root.getAnimations({ subtree: true })].some(
        (a) => a.playState === "running",
      );
    if (!ready) return false;
    // The calendar tab's incoming parent and its scrollport can still move
    // this row after its own stagger ended. A touch uses viewport coordinates,
    // so wait for its full ancestor chain and actual hit rectangle to settle.
    for (let el = root.parentElement; el; el = el.parentElement)
      if (el.getAnimations().some((a) => a.playState === "running"))
        return false;
    for (let i = 0; i < 4; i++) {
      await new Promise(requestAnimationFrame);
      const next = front.getBoundingClientRect();
      if (
        Math.abs(next.x - box.x) > 0.5 ||
        Math.abs(next.y - box.y) > 0.5 ||
        Math.abs(next.width - box.width) > 0.5
      )
        return false;
    }
    return true;
  }, `calendar-list-record-${floorId}`);
  const rect = await frontSurface.boundingBox(),
    x = rect.x + rect.width * 0.7,
    y = rect.y + rect.height * 0.5;
  if (!safari) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - i * 12, y }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 120, y, { steps: 10 });
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
  await cell
    .getByRole("button", { name: "撤销地板打卡", exact: true })
    .waitFor();
  check(
    (await cell
      .getByRole("button", { name: "撤销地板打卡", exact: true })
      .count()) === 1,
    "whole-row swipe exposes actions inside the real ScreenStage without click disclosure",
  );
  check(
    (await cell
      .locator(".swipe-undo")
      .evaluate((el) => getComputedStyle(el).backgroundColor)) ===
      "rgb(201, 64, 64)",
    "exposed undo is red",
  );
  check(
    (await cell
      .locator(".swipe-edit")
      .evaluate((el) => getComputedStyle(el).backgroundColor)) ===
      "rgb(39, 132, 81)",
    "exposed correction is green",
  );
  // The actual current member can skip from the adjacent question control.
  await page.getByTestId("nav-water").click();
  await page.getByRole("button", { name: "抬水临时安排", exact: true }).click();
  await page.getByRole("textbox", { name: "跳过原因" }).fill("上课");
  const fieldEdges = await page
    .getByRole("textbox", { name: "跳过原因" })
    .evaluate(async (el) => {
      const samples = [];
      for (let i = 0; i < 28; i++) {
        await new Promise(requestAnimationFrame);
        const bounds = el.getBoundingClientRect(),
          clip = el.closest(".sheet-content").getBoundingClientRect(),
          style = getComputedStyle(el);
        const outline =
          (parseFloat(style.outlineWidth) || 0) +
          Math.max(0, parseFloat(style.outlineOffset) || 0);
        samples.push(
          bounds.left - outline >= clip.left + 0.5 &&
            bounds.right + outline <= clip.right - 0.5,
        );
      }
      return samples;
    });
  check(
    fieldEdges.every(Boolean),
    "focused reason field keeps both borders and focus outline inside the sheet throughout glass overshoot",
  );
  await page.getByRole("button", { name: "移到队尾", exact: true }).click();
  await page.waitForTimeout(600);
  check(
    (await board()).water_task.assignee_id === people[1].user_id,
    "water question opens the real skip route and moves owner to tail",
  );
  await page.getByRole("button", { name: "抬水临时安排", exact: true }).click();
  await page
    .getByTestId("water-exception")
    .getByRole("button", { name: "我已抬水", exact: true })
    .click();
  await page.waitForTimeout(420);
  check(
    await page
      .locator(".water-exception .completion-surface")
      .getAttribute("class")
      .then((s) => s.includes("is-round")),
    "advance submission preserves the existing round/check completion chain",
  );
  await page.waitForTimeout(1000);
  check(
    (await board()).water_advance_task_id > 0,
    "advance has an acknowledged server receipt",
  );
  await page
    .getByRole("button", { name: "关闭详情", exact: true })
    .last()
    .click();
  // A transition with prepaid steps runs only on first active water entry.
  await page.goto(url + "?reel=1");
  await page.getByTestId("pane-duty").waitFor();
  await page.evaluate(
    ({ id }) => {
      window.qa.event.value = {
        id: 999,
        sequence: 999,
        from_member_id: id,
        completed_at: new Date().toISOString(),
        steps: [
          {
            member_id: id,
            task_id: 998,
            completed_at: new Date().toISOString(),
          },
        ],
      };
    },
    { id: people[0].user_id },
  );
  check(
    (await page.getByTestId("water-name-reel").count()) === 0,
    "inactive water receipt does not play or get consumed",
  );
  await page.evaluate(() => {
    window.qa.active.value = true;
  });
  await page.getByTestId("water-name-reel").waitFor();
  await page.getByTestId("water-credit-complete").waitFor({ timeout: 4000 });
  check(
    (await page.getByTestId("water-credit-complete").innerText()).includes(
      "甲 · 已完成",
    ),
    "slot reel lands on the prepaid member and shows a completion check",
  );
  await page.waitForTimeout(2900);
  check(
    (await page.getByTestId("water-name-reel").count()) === 0,
    "second reel settles on the actual next member",
  );
  await page.evaluate(() => {
    window.qa.key.value++;
  });
  await page.waitForTimeout(200);
  check(
    (await page.getByTestId("water-name-reel").count()) === 0,
    "remount does not replay a consumed water receipt",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.qa.event.value = {
      ...window.qa.event.value,
      id: 1000,
      sequence: 1000,
    };
  });
  await page.waitForTimeout(100);
  check(
    (await page.getByTestId("water-name-reel").count()) === 0,
    "reduced motion keeps the same final handoff state without animation",
  );
  check(errors.length === 0, `no browser errors: ${errors.join(";")}`);
  console.log(
    JSON.stringify({
      status: "passed",
      browser: safari ? "WebKit" : "Chromium",
      checks,
    }),
  );
} catch (error) {
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    await fs.mkdir(new URL("../docs/evidence/water-flex/", import.meta.url), {
      recursive: true,
    });
    await page?.screenshot({
      path: new URL("../docs/evidence/water-flex/failure.png", import.meta.url)
        .pathname,
    });
    console.error(
      JSON.stringify({
        errors,
        body: (await page?.locator("body").innerText())?.slice(0, 600),
      }),
    );
  }
  throw error;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  h.close();
  await Promise.all([html, vue].map((p) => fs.unlink(p).catch(() => {})));
}

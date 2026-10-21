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
  name = `sheet-polish-${process.pid}`;
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
    `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import{createApp}from'vue';import{createPinia}from'pinia';import{createRouter,createWebHistory}from'vue-router';import{Icon}from'vant';import Root from'./${name}.vue';import'./src/theme.css';import'./src/interaction/glass.css';import{installTheme}from'./src/interaction/theme';installTheme();import'./src/style.css';import'./src/focus.css';import'./src/screen.css';createApp(Root).use(createPinia()).use(Icon).use(createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]})).mount('#app');</script>`,
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
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "地板", exact: true }).click();
  await page.waitForTimeout(450);
  await page.locator(".round-progress").click();
  await page.locator(".round-ranking-viewport").waitFor();
  await page.waitForTimeout(500);
  let sheet = page.locator(".elastic-sheet");
  const compact = await sheet.boundingBox();
  const handle = await page.locator(".sheet-handle").boundingBox();
  await page.mouse.move(195, handle.y + 12);
  await page.mouse.down();
  await page.mouse.move(195, Math.max(30, handle.y - 110), { steps: 12 });
  const held = await sheet.boundingBox();
  check(
    held.y < compact.y - 60,
    "settings/round sheet follows an upward handle drag before release",
  );
  await page.mouse.up();
  const sizes = await sheet.evaluate(async (el) => {
    const frames = [];
    for (let i = 0; i < 30; i++) {
      await new Promise(requestAnimationFrame);
      frames.push(el.getBoundingClientRect().y);
    }
    return frames;
  });
  check(
    new Set(sizes.map((n) => n.toFixed(2))).size > 3,
    "expanded sheet settles through real intermediate frames",
  );
  check(
    (await sheet.boundingBox()).height > 844 * 0.9,
    "explicitly expandable round sheet reaches near full screen",
  );
  check(
    (await page
      .locator(".round-ranking-viewport")
      .evaluate((el) => getComputedStyle(el).scrollbarWidth)) === "none",
    "round names scroll without a visible scrollbar",
  );
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  await page.locator(".round-progress").click();
  await page.waitForTimeout(500);
  const scroll = page.locator(".round-ranking-viewport");
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }),
    );
  });
  await page.waitForTimeout(500);
  check(
    (await page.locator(".elastic-sheet").boundingBox()).height > 844 * 0.9,
    "pulling beyond the names' bottom expands the round panel",
  );
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  if (!safari) {
    await page.locator(".round-progress").click();
    await page.waitForTimeout(500);
    const native = page.locator(".round-ranking-viewport");
    await native.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const rect = await native.boundingBox();
    const y = Math.min(810, rect.y + rect.height - 24);
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 195, y }],
    });
    for (const dy of [12, 30, 65, 110]) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 195, y: y - dy }],
      });
      await page.waitForTimeout(20);
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(600);
    check(
      (await page.locator(".elastic-sheet").boundingBox()).height > 844 * 0.9,
      "real mobile touch beyond list bottom expands the sheet",
    );
    await client.detach();
    await page.getByRole("button", { name: "关闭详情", exact: true }).click();
    await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  }
  await page.getByTestId("open-tools").click();
  await page.waitForTimeout(500);
  const settingsBefore = await page.locator(".elastic-sheet").boundingBox();
  const sh = await page.locator(".sheet-handle").boundingBox();
  await page.mouse.move(195, sh.y + 10);
  await page.mouse.down();
  await page.mouse.move(195, Math.max(30, sh.y - 100), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  check(
    (await page.locator(".elastic-sheet").boundingBox()).height >
      settingsBefore.height + 30,
    "settings handle expands its own panel",
  );
  check(
    (await page.locator(".appearance-options .liquid-nav-optics").count()) ===
      1,
    "settings reuses the actual navigation glass renderer",
  );
  await page.screenshot({ path: path.join(front, "../data/v62/settings.png") });
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("calendar-view-stats").waitFor();
  await page.getByTestId("calendar-view-stats").click();
  await page.waitForTimeout(600);
  const hint = page.locator(".hint-trigger").first();
  await hint.click();
  await page.locator(".hint-popover").waitFor();
  const hb = await hint.boundingBox(),
    pop = await page.locator(".hint-popover").boundingBox();
  check(
    pop.x >= 15 && pop.x + pop.width <= 375,
    "question bubble fits inside narrow screen",
  );
  check(
    Math.min(
      Math.abs(pop.y + pop.height - hb.y),
      Math.abs(pop.y - hb.y - hb.height),
    ) < 25,
    "question bubble grows beside its own trigger",
  );
  check(
    (await page.locator(".hint-glass").count()) === 0,
    "help has no central modal backdrop",
  );
  await page.screenshot({ path: path.join(front, "../data/v62/hint.png") });
  await page.mouse.move(5, 400);
  await page
    .locator(".hint-popover")
    .waitFor({ state: "hidden", timeout: 8500 });
  check(true, "help bubble automatically retracts");
  await page.getByTestId("nav-duty").click();
  await page.getByTestId("pane-duty").waitFor();
  await page.waitForTimeout(500);
  for (const [i, text] of [
    [1, "自动收起测试"],
    [2, "长按回复测试"],
    [3, "手动已读测试"],
  ])
    await api("/chores/notes", people[i].token, {
      target_member_id: people[0].user_id,
      text,
    });
  await page.evaluate(() => window.qa.key.value++);
  const banner = page.getByTestId("reminder-banner");
  await banner.filter({ hasText: "自动收起测试" }).waitFor();
  await banner.filter({ hasText: "长按回复测试" }).waitFor({ timeout: 9500 });
  check(
    !(await board()).reminders.find((n) => n.body === "自动收起测试").read_at,
    "timer retract keeps the message unread",
  );
  await page.waitForTimeout(750);
  const b = await page.locator(".reminder-banner-card").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 25);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.locator(".companion-note-form").waitFor();
  check(
    (await page
      .getByRole("button", { name: people[2].nickname, exact: true })
      .getAttribute("aria-pressed")) === "true",
    "long press opens reply with the actual sender selected",
  );
  check(
    (await board(people[2])).reminders.every((n) => n.body !== "长按回复测试"),
    "long press does not send a reply without confirmation",
  );
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  await banner.filter({ hasText: "手动已读测试" }).waitFor();
  await page.waitForTimeout(750);
  const c = await page.locator(".reminder-banner-card").boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + 48);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2, 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(650);
  check(
    !!(await board()).reminders.find((n) => n.body === "手动已读测试").read_at,
    "manual retract sends and persists the server read receipt",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("open-tools").click();
  await page.locator(".elastic-sheet").waitFor();
  check(
    (await page
      .locator(".elastic-sheet")
      .evaluate((el) => el.getAnimations().length)) === 0,
    "reduced motion keeps sheets usable without an entrance flight",
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

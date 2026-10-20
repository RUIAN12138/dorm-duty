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
  name = `theme-stats-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue"),
  evidence = path.join(root, "docs/evidence/theme-stats");
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
  for (const [key, days] of [
    ["floor", 4],
    ["toilet", 10],
  ]) {
    for (let entry = 0; entry < (key === "floor" ? 6 : 1); entry++) {
      const date = new Date(Date.now() - days * 86400000)
          .toISOString()
          .slice(0, 10),
        b = await board();
      assert.equal(
        (
          await h.request("/chores/history", {
            method: "POST",
            token: room.access_token,
            data: {
              version: b.version,
              member_id: room.member_id,
              key,
              completed_at: date + `T10:0${entry}:00+08:00`,
              reason: "隔离主题验收",
            },
          })
        ).status,
        201,
      );
    }
  }
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fff"><div id="app"></div>${["rings", "emotions", "ball", "engine"].map((n) => `<script src="/vendor/emotion-ball/${n}.js"></script>`).join("")}<script type="module">import{createApp}from'vue';import{createPinia}from'pinia';import{createRouter,createWebHistory}from'vue-router';import{Icon}from'vant';import Root from'./${name}.vue';import'vant/es/icon/style/index.mjs';import'./src/theme.css';import'./src/screen.css';import'./src/style.css';import'./src/focus.css';import{installTheme}from'./src/interaction/theme';installTheme();const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});createApp(Root).use(createPinia()).use(router).use(Icon).mount('#app');</script>`,
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
  await page.route("**/chores/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      r = await h.request(u.pathname + u.search, {
        method: req.method(),
        token: req.headers().authorization?.replace("Bearer ", ""),
        ...(req.postData() ? { data: JSON.parse(req.postData()) } : {}),
      });
    await route.fulfill({
      status: r.status,
      contentType: "application/json",
      body: await r.text(),
    });
  });
  await page.goto(url);
  await page.getByTestId("pane-duty").waitFor();
  await page.waitForTimeout(400);
  const duty = await page.locator(".task-title-stage").boundingBox();
  check(
    duty.y > 844 * 0.3 && duty.y + duty.height < 844 * 0.62,
    "actual duty title sits slightly above screen centre with room for progress",
  );
  await page.evaluate(() => window.qa.theme("dark", { x: 350, y: 30 }));
  await page.waitForTimeout(100);
  const reveal = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.pseudoElement === "::view-transition-new(root)")
      .map((a) => ({
        progress: a.effect.getComputedTiming().progress,
        frames: a.effect.getKeyframes(),
      })),
  );
  if (await page.evaluate(() => !!document.startViewTransition)) {
    check(
      reveal.some(
        (a) =>
          a.progress > 0 &&
          a.progress < 1 &&
          a.frames.some((f) => f.clipPath?.startsWith("circle(")),
      ),
      "theme reveal has real intermediate circular clipping frames",
    );
  }
  await page.waitForTimeout(400);
  check(
    (await page.locator("meta[name=theme-color]").getAttribute("content")) ===
      "#151515",
    "dark browser chrome updates with the page theme",
  );
  await page.screenshot({
    path: path.join(
      evidence,
      `${safari ? "webkit" : "chromium"}-duty-dark.png`,
    ),
  });
  const lens = await page.locator(".liquid-nav-optics").evaluate((el) => ({
    opacity: Number(getComputedStyle(el).opacity),
    pixel: (() => {
      const gl = el.getContext("webgl");
      if (!gl) return null;
      const p = new Uint8Array(4);
      gl.readPixels(
        Math.floor(el.width / 6),
        Math.floor(el.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p,
      );
      return [...p];
    })(),
  }));
  if (lens.opacity === 1) {
    await page.getByTestId("nav-calendar").click();
    await page.getByTestId("calendar-view-grid").waitFor();
    await page.waitForTimeout(250);
    check(
      lens.pixel?.[3] > 0 && Math.max(...lens.pixel.slice(0, 3)) < 110,
      "WebGL selected glass is dark and keeps its buffer while idle",
    );
  } else
    check(
      await page
        .locator(".nav-selection")
        .evaluate((el) =>
          getComputedStyle(el).backgroundColor.includes("56, 57, 61"),
        ),
      "CSS fallback lens uses the dark palette",
    );
  if (lens.opacity === 1) {
    check(
      await page.locator(".liquid-nav-optics").evaluate((el) => {
        const label = document.querySelector(
            ".chore-bottom-nav a.active .nav-native-caption",
          ),
          box = label.getBoundingClientRect(),
          canvas = el.getBoundingClientRect(),
          gl = el.getContext("webgl");
        if (!gl) return false;
        const ratio = el.width / canvas.width,
          w = Math.floor(box.width * ratio),
          h = Math.floor(box.height * ratio),
          pixels = new Uint8Array(w * h * 4);
        gl.readPixels(
          Math.floor((box.left - canvas.left) * ratio),
          Math.floor(el.height - (box.bottom - canvas.top) * ratio),
          w,
          h,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        return pixels.some((v, i) => i % 4 !== 3 && v > 200);
      }),
      "dark glass refreshes the newly selected page label through its colour transition",
    );
  }
  const frames = await page.evaluate(async () => {
    const rows = [];
    for (let i = 0; i < 8; i++) {
      window.qa.theme(i % 2 ? "light" : "dark", { x: 350, y: 30 });
      await new Promise((r) => setTimeout(r, 35));
      const nav = document.querySelector(".chore-bottom-nav"),
        lens = nav.querySelector(".liquid-nav-optics");
      rows.push({
        opacity: Number(getComputedStyle(nav).opacity),
        rendered:
          !!nav.querySelector(".nav-selection") ||
          getComputedStyle(lens).opacity === "1",
      });
    }
    return rows;
  });
  check(
    frames.every((f) => f.opacity === 1 && f.rendered),
    "rapid theme reversals never hide both the live glass and fallback",
  );
  check(
    (await page.locator("meta[name=theme-color]").getAttribute("content")) ===
      "#ffffff",
    "top browser chrome follows the current light theme",
  );
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("calendar-view-stats").click();
  await page.getByTestId("stats-floor").waitFor();
  await page.waitForTimeout(400);
  check(
    (await page.getByTestId("stats-floor").getAttribute("data-tone")) ===
      "warm",
    "per-task interval marks four-day floor history warm",
  );
  check(
    (await page.getByTestId("stats-toilet").getAttribute("data-tone")) ===
      "alert",
    "longer toilet interval is a warning",
  );
  const color = async (key) =>
    page
      .getByTestId("stats-" + key)
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  const lightColor = await color("floor");
  check(
    await page.getByTestId("stats-floor").evaluate((el) => {
      const light = getComputedStyle(el)
        .backgroundColor.match(/\d+/g)
        .map(Number);
      const deep = getComputedStyle(
        document.querySelector('[data-testid="stats-toilet"]'),
      )
        .backgroundColor.match(/\d+/g)
        .map(Number);
      return light[0] > light[1] && light[1] > light[2] && deep[0] < light[0];
    }),
    "daytime warnings use one brown/yellow palette that deepens with the interval",
  );
  await page.evaluate(() => window.qa.theme("dark"));
  await page.waitForTimeout(250);
  check(
    (await color("floor")) !== lightColor,
    "warning fill has a separate dark palette",
  );
  await page.getByRole("button", { name: "统计提醒颜色", exact: true }).click();
  const oldNightColor = await color("floor");
  await page.getByLabel("统计基色", { exact: true }).fill("#444444");
  check(
    (await color("floor")) === oldNightColor,
    "daytime colour customisation leaves the nighttime grey/white palette intact",
  );
  await page.evaluate(() => window.qa.theme("light"));
  await page.waitForTimeout(150);
  check(
    (await color("floor")) !== lightColor,
    "custom daytime colour updates the actual card",
  );
  await page.evaluate(() => window.qa.theme("dark"));
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.locator(".sheet-layer").waitFor({ state: "detached" });
  await page.screenshot({
    path: path.join(
      evidence,
      `${safari ? "webkit" : "chromium"}-stats-dark.png`,
    ),
  });
  await page.getByTestId("calendar-view-list").click();
  await page.locator(".records-heading").first().waitFor();
  check(
    (await page.locator(".record-date").count()) === 0,
    "only the list reverts to expandable record stacks",
  );
  await page.locator(".records-heading").first().click();
  await page.waitForTimeout(400);
  check(
    (await page.locator(".record-row").count()) > 0,
    "historical date expands actual member rows",
  );
  const nativeScroll = page.locator(".folded-record-page");
  const scrollBox = await nativeScroll.boundingBox();
  if (safari) {
    // Playwright's mobile WebKit cannot send wheel/touch drags. Verify that the
    // real wheel handler leaves this scroll island to the browser, then scroll.
    check(
      await nativeScroll.evaluate((el) => {
        const event = new WheelEvent("wheel", {
          deltaY: 240,
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(event);
        return !event.defaultPrevented;
      }),
      "WebKit leaves record-list wheel events unclaimed",
    );
    await nativeScroll.evaluate((el) => el.scrollBy(0, 240));
  } else {
    const cdp = await page.context().newCDPSession(page);
    const x = scrollBox.x + scrollBox.width / 2;
    const y = scrollBox.y + scrollBox.height * 0.8;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 12; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y - step * 15 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  }
  await page.waitForTimeout(350);
  check(
    await nativeScroll.evaluate((el) => el.scrollTop > 0),
    "restored long record list scrolls natively inside the fixed page",
  );
  check(
    await page
      .locator(".screen-surface")
      .evaluate(
        (el) =>
          Math.abs(new DOMMatrix(getComputedStyle(el).transform).m42) < 0.1,
      ),
    "record list scrolling never pulls the whole page",
  );
  check(
    await nativeScroll
      .locator(".record-row")
      .first()
      .evaluate((el) => getComputedStyle(el).touchAction.includes("pan-y")),
    "touch targets allow vertical native scrolling",
  );
  await page.getByTestId("nav-water").click();
  await page.getByTestId("pane-water").waitFor();
  check(
    await page
      .locator(".water-nudge-actions, .water-pane .completion-surface")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).marginTop) >= 20),
    "water secondary actions move down without shifting the name",
  );
  await page.getByTestId("nav-duty").click();
  await page.getByTestId("pane-duty").waitFor();
  check(
    await page
      .locator(".completion-surface")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).marginTop) >= 20),
    "duty action moves down while title retains its anchor",
  );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .getByRole("button", { name: "查看地板详情", exact: true })
      .click();
    await page.waitForTimeout(350);
    check(
      await page
        .locator(".elastic-sheet")
        .evaluate(
          (el) => el.getBoundingClientRect().height <= innerHeight * 0.75 + 1,
        ),
      `${width}x${height} task detail stays within three quarters of screen`,
    );
    await page.getByRole("button", { name: "关闭详情", exact: true }).click();
    await page.locator(".sheet-layer").waitFor({ state: "detached" });
    await page.getByTestId("open-tools").click();
    await page.waitForTimeout(350);
    check(
      await page
        .locator(".elastic-sheet")
        .evaluate(
          (el) => el.getBoundingClientRect().height <= innerHeight * 0.75 + 1,
        ),
      `${width}px long settings sheet also obeys the common height cap`,
    );
    await page.getByRole("button", { name: "关闭详情", exact: true }).click();
    await page.locator(".sheet-layer").waitFor({ state: "detached" });
  }
  await page.goto(url + "?deck=1");
  await page.locator(".deck-card.is-front").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".deck-card.is-front")?.dataset.cardIndex === "1",
  );
  check(true, "automatic switching uses the existing deck animation");
  const stage = page.locator(".deck-stage");
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const manual = await page
    .locator(".deck-card.is-front")
    .getAttribute("data-card-index");
  await page.evaluate(() => window.qa.remount());
  await page.waitForTimeout(850);
  check(
    (await page
      .locator(".deck-card.is-front")
      .getAttribute("data-card-index")) === manual,
    "manual switching stays paused across a component reopen",
  );
  await page.waitForFunction(
    (index) =>
      document.querySelector(".deck-card.is-front")?.dataset.cardIndex !==
      index,
    manual,
  );
  check(true, "autoplay resumes after the configured idle period");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = await page
    .locator(".deck-card.is-front")
    .getAttribute("data-card-index");
  await page.waitForTimeout(900);
  check(
    (await page
      .locator(".deck-card.is-front")
      .getAttribute("data-card-index")) === hidden,
    "background pages do not continue autoplay",
  );
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(
    (index) =>
      document.querySelector(".deck-card.is-front")?.dataset.cardIndex !==
      index,
    hidden,
  );
  check(true, "returning to the foreground resumes eligible autoplay");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(250);
  const reduced = await page
    .locator(".deck-card.is-front")
    .getAttribute("data-card-index");
  await page.waitForTimeout(1100);
  check(
    (await page
      .locator(".deck-card.is-front")
      .getAttribute("data-card-index")) === reduced,
    "reduced motion disables automatic card movement",
  );
  check(errors.length === 0, "no uncaught browser errors");
  await fs.writeFile(
    path.join(evidence, `${safari ? "webkit" : "chromium"}.json`),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      status: "passed",
      browser: safari ? "WebKit" : "Chromium",
      checks: checks.length,
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

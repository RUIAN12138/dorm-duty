// Runs in existing GitHub browser CI against disposable data; never uses real accounts.
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
  name = `companion-qa-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue"),
  evidence = path.join(root, "docs/evidence/companion");
let browser, server, page;
const h = await createHarness();
const errors = [];
let checks = 0;
function check(value, label) {
  assert.ok(value, label);
  checks++;
}
try {
  const created = await (
    await h.request("/guest/create", {
      method: "POST",
      data: { name: "球球交互验收", nickname: "甲", members: ["乙"] },
    })
  ).json();
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>${["rings", "emotions", "ball", "engine"].map((n) => `<script src="/vendor/emotion-ball/${n}.js"></script>`).join("")}<script>window.qaEngines=[];const create=EmotionBall.create;EmotionBall.create=function(el,opts){const e=create(el,opts);e.qaHost=el;const gaze=e.setGaze;e.setGaze=function(x,y){e.qaGaze={x,y};return gaze.call(e,x,y)};window.qaEngines.push(e);return e}</script><script type="module">import{createApp}from'vue';import{createPinia}from'pinia';import{createRouter,createWebHistory}from'vue-router';import{Icon,Switch}from'vant';import Root from './${name}.vue';import'vant/lib/index.css';import'./src/style.css';const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});createApp(Root).use(createPinia()).use(router).use(Icon).use(Switch).mount('#app')</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{ref}from'vue';import Login from'./src/components/CompanionLogin.vue';import Board from'./src/components/ChoreBoard.vue';import{captureCompanionHandoff}from'./src/interaction/companion';const entered=ref(false);function enter(){captureCompanionHandoff();entered.value=true;}</script><template><main v-if="!entered" style="max-width:360px;margin:auto;padding:16px"><Login/><label>邮箱<input data-testid="qa-email" type="email" style="display:block;width:100%;padding:14px;margin:16px 0"/></label><label>密码<input data-testid="qa-password" type="password" style="display:block;width:100%;padding:14px;margin:16px 0"/></label><label>验证码<input data-testid="qa-code" autocomplete="one-time-code" style="display:block;width:100%;padding:14px;margin:16px 0"/></label><button data-testid="qa-enter" @click="enter">进入</button></main><main v-else class="guest-page has-chore-nav"><Board invite="${created.invite_code}" dorm-name="球球交互验收" :member-id="${created.member_id}" token="fixture" :demo="false" section="duty"/></main></template>`,
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
  const url = `http://127.0.0.1:${port}/${name}.html`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await (
    process.env.DORM_BROWSER === "webkit" ? webkit : chromium
  ).launch({
    headless: true,
    ...(process.platform === "darwin" && process.env.DORM_BROWSER !== "webkit"
      ? {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        }
      : {}),
  });
  page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/chores/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    let data;
    try {
      data = req.postDataJSON();
    } catch {}
    const res = await h.request(u.pathname + u.search, {
      method: req.method(),
      token: created.access_token,
      ...(data ? { data } : {}),
    });
    await route.fulfill({
      status: res.status,
      contentType: "application/json",
      body: await res.text(),
    });
  });
  await page.goto(url);
  check(
    await page.evaluate(
      () =>
        EmotionBall.config.list().find((e) => e.id === "02").name ===
        "待机放空",
    ),
    "upstream expression names are decoded as UTF-8",
  );
  await page.locator("[data-companion-login] svg").waitFor();
  const loginBox = await page
    .locator("[data-companion-login] .dorm-companion")
    .boundingBox();
  check(
    loginBox.width >= 100 &&
      loginBox.width <= 130 &&
      Math.abs(loginBox.x + loginBox.width / 2 - 195) < 8 &&
      loginBox.y > 0 &&
      loginBox.y < 300,
    "compact login ball is centered above the form",
  );
  await page.getByTestId("qa-email").fill("qa@example.invalid");
  const reading = await page.evaluate(() => window.qaEngines[0].qaGaze);
  check(
    reading && reading.y > 0,
    "email caret attracts the gaze below the ball",
  );
  await page.getByTestId("qa-password").focus();
  await page.mouse.move(370, 750);
  await page.waitForTimeout(50);
  let hidden = await page.evaluate(() => window.qaEngines[0].qaGaze);
  check(
    hidden.x === -1 && hidden.y < 0,
    "password gaze stays away despite pointer movement",
  );
  await page.getByTestId("qa-code").focus();
  await page.mouse.move(20, 750);
  await page.waitForTimeout(50);
  hidden = await page.evaluate(() => window.qaEngines[0].qaGaze);
  check(
    hidden.x === -1 && hidden.y < 0,
    "one-time code gets the same privacy treatment",
  );
  // Blur the secret before entry, leaving the hero at its actual login geometry.
  await page.getByTestId("qa-enter").click();
  await page.getByTestId("chore-board").waitFor();
  const movement = await page
    .locator(".board-identity .dorm-companion")
    .evaluate(
      (el) =>
        new Promise((resolve) => {
          const frames = [];
          const start = performance.now();
          function frame() {
            const b = el.getBoundingClientRect();
            frames.push({
              x: b.x,
              y: b.y,
              w: b.width,
              opacity: Number(
                getComputedStyle(document.querySelector(".identity-name"))
                  .opacity,
              ),
            });
            if (performance.now() - start < 1250) requestAnimationFrame(frame);
            else resolve(frames);
          }
          requestAnimationFrame(frame);
        }),
    );
  check(
    new Set(movement.map((f) => Math.round(f.w))).size > 3,
    "login ball travels and shrinks through real intermediate frames",
  );
  check(
    movement.some((f) => f.w > 70 && f.opacity < 0.05),
    "page identity waits while ball is moving",
  );
  check(
    movement.at(-1).w < 60 && movement.at(-1).opacity > 0.95,
    "ball arrives in corner before page content becomes visible",
  );
  const ball = page.locator(".board-identity .dorm-companion");
  await ball.dblclick({ delay: 75 });
  await page.waitForTimeout(500);
  check(
    (await page
      .getByRole("heading", { name: "给室友留句话", exact: true })
      .count()) === 0,
    "double click plays without opening a message draft",
  );
  check(
    (await page
      .getByText("再双击一次，换个表情。", { exact: true })
      .count()) === 0,
    "double click no longer opens a play dialogue",
  );
  const playMoods = [
    await page.evaluate(
      () =>
        window.qaEngines.find((e) => e.qaHost.closest(".board-identity"))
          .emotionId,
    ),
  ];
  for (let n = 0; n < 12; n++) {
    await ball.dblclick({ delay: 75 });
    await page.waitForTimeout(220);
    await page.locator(".companion-chat").waitFor({ state: "detached" });
    playMoods.push(
      await page.evaluate(
        () =>
          window.qaEngines.find((e) => e.qaHost.closest(".board-identity"))
            .emotionId,
      ),
    );
  }
  check(
    new Set(playMoods).size >= 10,
    `repeated doubles explore more existing expressions than the former four-state loop: ${JSON.stringify(playMoods)}`,
  );
  check(
    playMoods.every((id, index) => !index || id !== playMoods[index - 1]),
    "consecutive double interactions do not replay the same expression",
  );
  check(
    (await page
      .getByText("再双击一次，换个表情。", { exact: true })
      .count()) === 0,
    "repeated interactions keep play dialogue absent while functional tips remain available",
  );
  await ball.click();
  await page.locator(".companion-chat").waitFor();
  await page.waitForFunction(() => {
    const chat = document.querySelector(".companion-chat"),
      quickPrompts = chat?.querySelector(".chat-quick-prompts"),
      noteAction = quickPrompts?.querySelector("button:first-child"),
      dock = quickPrompts?.closest(".chat-dock-panel"),
      actionRect = noteAction?.getBoundingClientRect(),
      dockRect = dock?.getBoundingClientRect();
    return (
      chat?.getAttribute("data-phase") === "open" &&
      quickPrompts &&
      !quickPrompts.classList.contains("is-hidden") &&
      Number(getComputedStyle(quickPrompts).opacity) > 0.99 &&
      noteAction &&
      !noteAction.disabled &&
      actionRect &&
      dockRect &&
      actionRect.height > 0 &&
      actionRect.top < dockRect.bottom &&
      actionRect.bottom > dockRect.top
    );
  });
  check(
    (await page.locator("#companion-note-text").count()) === 0 &&
      (await page
        .getByRole("button", { name: "我要留言", exact: true })
        .isVisible()) &&
      (await page
        .getByRole("button", { name: "我要留言", exact: true })
        .isEnabled()),
    "single click opens unified chat with the note quick action, not a duplicate composer",
  );
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await page.locator(".companion-chat").waitFor({ state: "hidden" });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByTestId("open-tools").click();
    await page.getByTestId("open-companion-settings").click();
    await page
      .getByRole("heading", { name: "球球设置", exact: true })
      .waitFor();
    await page.getByText("查看全部 32 种表情", { exact: true }).click();
    await page.waitForTimeout(350);
    const preview = page.locator(".emotion-pinned"),
      header = page.locator("[data-sheet-header]"),
      handle = page.locator("[data-sheet-handle]");
    const initial = await preview.boundingBox(),
      title = await header.boundingBox(),
      grab = await handle.boundingBox();
    const scroll = page.locator("[data-sheet-scroll]");
    await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(100);
    const end = await preview.boundingBox(),
      titleEnd = await header.boundingBox(),
      grabEnd = await handle.boundingBox();
    check(
      await scroll.evaluate((el) => el.scrollTop > 100),
      `${width}px expression list actually scrolls`,
    );
    check(
      Math.abs(initial.y - end.y) < 6,
      `${width}px live ball preview stays pinned`,
    );
    check(
      Math.abs(title.y - titleEnd.y) < 1 && Math.abs(grab.y - grabEnd.y) < 1,
      `${width}px title and drag handle stay fixed`,
    );
    check(
      (await page.locator(".emotion-choices button").count()) === 32,
      "all 32 expressions remain selectable",
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px no horizontal overflow`,
    );
    if (width === 390)
      await page.screenshot({ path: path.join(evidence, "pinned-ball.png") });
    await page.getByRole("button", { name: "关闭详情", exact: true }).click();
    await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: "passed",
      browser: process.env.DORM_BROWSER === "webkit" ? "WebKit" : "Chromium",
      checks,
    }),
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: path.join(evidence, "failure.png") })
      .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  h.close();
  await fs.rm(html, { force: true });
  await fs.rm(vue, { force: true });
}

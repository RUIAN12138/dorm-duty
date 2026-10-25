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
  name = `task-detail-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue"),
  evidence = path.join(root, "docs/evidence/task-detail");
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
  const initial = await board();
  await h.request("/chores/order", {
    method: "PATCH",
    token: room.access_token,
    data: {
      version: initial.version,
      key: "water",
      rotation_order: [
        room.dorm.members[1].user_id,
        room.member_id,
        room.dorm.members[2].user_id,
      ],
    },
  });
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fff"><div id="app"></div>${["rings", "emotions", "ball", "engine"].map((n) => `<script src="/vendor/emotion-ball/${n}.js"></script>`).join("")}<script type="module">import{createApp}from'vue';import{createPinia}from'pinia';import{createRouter,createWebHistory}from'vue-router';import{Icon}from'vant';import Root from'./${name}.vue';import'vant/es/icon/style/index.mjs';import'./src/theme.css';import'./src/screen.css';import'./src/style.css';import'./src/focus.css';import{installTheme}from'./src/interaction/theme';installTheme();const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});window.qaRoutes=[];router.afterEach(to=>window.qaRoutes.push(to.path));createApp(Root).use(createPinia()).use(router).use(Icon).mount('#app');</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{computed}from'vue';import{useRoute}from'vue-router';import Stage from'./src/components/ScreenStage.vue';import Board from'./src/components/ChoreBoard.vue';import Nav from'./src/components/ChoreBottomNav.vue';import{setThemeMode}from'./src/interaction/theme';const route=useRoute(),section=computed(()=>route.path==='/water'?'water':'duty');(window as any).qa={theme:setThemeMode};</script><template><Stage signed-in><main class="guest-page"><Board invite="${room.invite_code}" dorm-name="交互验收" :member-id="${room.member_id}" token="${room.access_token}" :demo="false" :section="section"/></main></Stage><Nav :section="section"/></template>`,
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
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === "webgl" ? null : get.call(this, kind, ...args);
    };
  });
  await page.goto(url);
  await page.getByTestId("pane-duty").waitFor();
  await page.getByTestId("nav-water").click();
  await page.getByTestId("pane-water").waitFor();
  await page.waitForTimeout(750);
  async function monitor() {
    await page.evaluate(() => {
      window.detailFrames = [];
      const start = performance.now();
      function frame() {
        const p = document.querySelector(".sheet-layer .elastic-sheet");
        if (p) {
          const m = new DOMMatrixReadOnly(getComputedStyle(p).transform);
          window.detailFrames.push({
            y: m.m42,
            opacity: Number(getComputedStyle(p).opacity),
          });
        }
        if (performance.now() - start < 550) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  await monitor();
  await page.getByRole("button", { name: "查看任务", exact: true }).click();
  await page.getByTestId("task-detail").waitFor();
  await page.waitForTimeout(600);
  const detail = page.getByTestId("task-detail");
  check(
    (await detail.getByRole("button").count()) === 0,
    "task detail has no reminder action",
  );
  check(
    (await page.getByTestId("remind-detail-task").count()) === 0,
    "pending task belonging to another member has no old remind button",
  );
  check(
    (await detail.locator(".task-detail-assignee").innerText()) === "乙",
    "assignee remains accurate",
  );
  check(
    (await detail.locator(".task-detail-status").innerText()) === "轮到抬水",
    "task state remains accurate",
  );
  check(
    await detail.evaluate((el) => {
      if (el.querySelector(".member-mark")) return false;
      const row = el.querySelector(".task-detail-person");
      return (
        row?.children.length === 2 &&
        row.children[0].classList.contains("task-detail-assignee") &&
        row.children[1].classList.contains("task-detail-status")
      );
    }),
    "task detail omits the legacy member mark without reserving a blank slot",
  );
  check(
    await page.evaluate(() =>
      window.detailFrames.some(
        (f) => f.y > 2 && f.y < 150 && f.opacity === 1,
      ),
    ),
    "task detail retains visible bottom-sheet entrance frames",
  );
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(150);
    const layout = await detail.evaluate((el) => {
      const p = el.closest(".elastic-sheet"),
        r = p.getBoundingClientRect(),
        title = p.querySelector(".sheet-heading h2").getBoundingClientRect(),
        content = el
          .querySelector(".task-full-content")
          .getBoundingClientRect(),
        row = el.querySelector(".task-detail-person");
      return {
        height: r.height,
        max: innerHeight * 0.75,
        aligned: Math.abs(title.x - content.x) < 1,
        overflow:
          row.scrollWidth > row.clientWidth || el.scrollWidth > el.clientWidth,
        rows: el.querySelectorAll(".task-detail-person").length,
      };
    });
    check(
      layout.aligned && !layout.overflow && layout.height <= layout.max,
      `${width}px title and content align, compact sheet fits without overflow`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-water.png`),
  });
  await page.evaluate(() => window.qa.theme("dark"));
  await page.waitForTimeout(600);
  check(
    await detail
      .locator(".task-detail-person")
      .evaluate(
        (el) => getComputedStyle(el).backgroundColor !== "rgb(243, 243, 243)",
      ),
    "assignee row follows existing dark theme",
  );
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-dark.png`),
  });
  await monitor();
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await detail.waitFor({ state: "detached" });
  await page.waitForTimeout(350);
  check(
    await page.evaluate(() =>
      window.detailFrames.some(
        (f) => f.y > 2 && f.y < 150 && f.opacity === 1,
      ),
    ),
    "task detail retains animated exit before content is removed",
  );
  await page.getByTestId("nav-duty").click();
  await page.getByTestId("pane-duty").waitFor();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "查看地板详情", exact: true }).click();
  await detail.waitFor();
  await page.waitForTimeout(400);
  check(
    (await detail.locator(".task-detail-status").innerText()) === "本轮待完成",
    "shared duty detail retains its own status",
  );
  check(
    (await detail.locator(".task-detail-assignee").innerText()) === "甲",
    "shared duty detail retains its own assignee",
  );
  check(errors.length === 0, "no uncaught browser errors");
  console.log(
    JSON.stringify(
      {
        browser: safari ? "webkit" : "chromium",
        passed: checks.length,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server?.kill();
  h.close();
  await fs.rm(html, { force: true });
  await fs.rm(vue, { force: true });
}

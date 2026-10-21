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
import { createCompanionRuntime } from "../scripts/companion-ai.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
const root = new URL("../", import.meta.url).pathname,
  front = path.join(root, "frontend"),
  name = `companion-chat-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue"),
  evidence = path.join(root, "docs/evidence/companion-chat");
const h = await createHarness(),
  checks = [],
  errors = [];
let browser, server, runtime;
let failModel = false,
  modelDelay = 500;
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
  for (const [i, m] of room.dorm.members.entries()) {
    h.db.sqlite
      .prepare(
        "INSERT INTO email_accounts(email,mail_enabled_at,created_at) VALUES(?,?,?)",
      )
      .run(
        `chat-${i}@example.invalid`,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    const id = h.db.sqlite
      .prepare("SELECT id FROM email_accounts WHERE email=?")
      .get(`chat-${i}@example.invalid`).id;
    h.db.sqlite
      .prepare(
        "INSERT INTO email_members(account_id,user_id,dorm_id,bound_at) VALUES(?,?,?,?)",
      )
      .run(id, m.user_id, room.dorm.id, new Date().toISOString());
  }
  runtime = createCompanionRuntime(h.db, {
    config: {
      api_key: "fixture",
      model: "glm-4.7-flash",
      asr_model: "glm-asr-2512",
    },
    env: h.env,
    autoStart: false,
    dispatch: (r) =>
      h.request(new URL(r.url).pathname + new URL(r.url).search, {
        token: room.access_token,
      }),
    fetcher: async (url, options) => {
      await new Promise((r) => setTimeout(r, modelDelay));
      if (failModel) return new Response("{}", { status: 503 });
      const data = JSON.parse(options.body),
        text = data.messages.at(-1).content;
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                messages: text.includes("提醒")
                  ? ["先确认下面的时间吧"]
                  : ["你好，我是球球。", "有事就问我吧。"],
                emotion: "10",
                reminder: text.includes("提醒")
                  ? {
                      target_id: room.member_id,
                      due_at: new Date(Date.now() + 3600000).toISOString(),
                      text: "记得做值日",
                    }
                  : null,
              }),
            },
          },
        ],
      });
    },
  });
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fff"><div id="app"></div>${["rings", "emotions", "ball", "engine"].map((n) => `<script src="/vendor/emotion-ball/${n}.js"></script>`).join("")}<script type="module">import{createApp}from'vue';import{createPinia}from'pinia';import{createRouter,createWebHistory}from'vue-router';import{Icon}from'vant';import Root from'./${name}.vue';import'vant/es/icon/style/index.mjs';import'./src/theme.css';import'./src/screen.css';import'./src/style.css';import'./src/focus.css';import{installTheme}from'./src/interaction/theme';installTheme();import{installNativeBack}from'./src/interactions/nativeBack';installNativeBack();const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});window.qaRoutes=[];router.afterEach(to=>window.qaRoutes.push(to.path));createApp(Root).use(createPinia()).use(router).use(Icon).mount('#app');</script>`,
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
      headers = { ...req.headers() };
    delete headers.origin;
    const body = req.postData();
    let r;
    if (u.pathname.startsWith("/chores/companion/"))
      r = await runtime.route(
        new Request("https://test.invalid" + u.pathname + u.search, {
          method: req.method(),
          headers,
          body: ["GET", "HEAD"].includes(req.method()) ? undefined : body,
        }),
      );
    else
      r = await h.request(u.pathname + u.search, {
        method: req.method(),
        token: headers.authorization?.slice(7),
        ...(body ? { data: JSON.parse(body) } : {}),
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
  await page.waitForTimeout(1000);
  const ball = page.locator(".board-identity .dorm-companion");
  async function hold() {
    const r = await ball.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(620);
    await page.mouse.up();
    await page.getByRole("dialog").waitFor();
    await page.getByLabel("和球球说句话", { exact: true }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="和球球说句话"]').disabled,
    );
  }
  // Cancelled long press cannot open chat or leak a delayed single-tap action.
  let r = await ball.boundingBox();
  await page.mouse.move(r.x + 20, r.y + 20);
  await page.mouse.down();
  await page.mouse.move(r.x + 90, r.y + 20, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(650);
  check(
    (await page.locator(".companion-chat").count()) === 0,
    "moving before long-press threshold cancels chat",
  );
  await page.evaluate(() => {
    window.chatFrames = [];
    const start = performance.now();
    function frame() {
      const b = document.querySelector(".chat-ball");
      if (b) {
        const r = b.getBoundingClientRect();
        window.chatFrames.push({ x: r.x, y: r.y, width: r.width });
      }
      if (performance.now() - start < 1500) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await hold();
  check(
    (await page.locator(".sheet-layer").count()) === 0,
    "long press does not trigger the existing single-tap note sheet",
  );
  check(
    await page.evaluate(() =>
      window.chatFrames.some((f) => f.width > 53 && f.width < 86),
    ),
    "ball travels from its original size through visible intermediate poses",
  );
  check(
    await page.getByTestId("chat-ball").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 45 && Math.abs(r.x + r.width / 2 - innerWidth / 2) < 1;
    }),
    "ball settles centered with safe top space",
  );
  check(
    await page
      .locator(".companion-chat-backdrop")
      .evaluate((el) => getComputedStyle(el).backdropFilter.includes("blur")),
    "only chat overlay supplies the requested frosted backdrop",
  );
  await page.getByLabel("和球球说句话", { exact: true }).fill("你好");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByText("让我想一想", { exact: true }).waitFor();
  check(true, "thinking pre-message is visible while provider is pending");
  await page.getByText("有事就问我吧。", { exact: true }).waitFor();
  check(
    (await page.locator(".chat-bubble.assistant").count()) === 2,
    "reply is split into individual short glass bubbles",
  );
  check(
    (await page.locator(".chat-ball").getByRole("img").count()) === 0,
    "ball uses its existing expression engine, not remote images",
  );
  await page.evaluate(() => {
    window.composerFrames = [];
    const end = performance.now() + 600;
    function frame() {
      window.composerFrames.push(
        document
          .querySelector('[data-testid="chat-voice"]')
          .getBoundingClientRect().width,
      );
      if (performance.now() < end) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await page.getByTestId("chat-voice").click();
  await page.waitForTimeout(450);
  check(
    await page.evaluate(() =>
      window.composerFrames.some((w) => w > 75 && w < 230),
    ),
    "composer morph crosses intermediate shapes instead of jumping",
  );
  check(
    await page
      .getByTestId("chat-voice")
      .evaluate((el) => el.getBoundingClientRect().width > 180),
    "voice button expands into an ellipse",
  );
  check(
    (await page
      .getByRole("button", { name: "切换文字输入", exact: true })
      .isVisible()) &&
      (await page.getByLabel("和球球说句话", { exact: true }).count()) === 0,
    "collapsed text side is only a keyboard switch, not an active input",
  );
  await page.getByRole("button", { name: "切换文字输入", exact: true }).click();
  await page.waitForTimeout(400);
  check(
    await page.getByLabel("和球球说句话", { exact: true }).isEditable(),
    "keyboard switch restores editable text",
  );
  await page
    .getByLabel("和球球说句话", { exact: true })
    .fill("一小时后提醒我值日");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByRole("button", { name: "确认安排", exact: true }).waitFor();
  check(
    h.db.sqlite
      .prepare(
        "SELECT COUNT(*) n FROM companion_reminder_actions WHERE status='pending'",
      )
      .get().n === 0,
    "chat reminder is only a proposal before explicit confirmation",
  );
  await page.getByRole("button", { name: "确认安排", exact: true }).click();
  await page.getByText("已安排提醒", { exact: true }).waitFor();
  check(
    h.db.sqlite
      .prepare(
        "SELECT COUNT(*) n FROM companion_reminder_actions WHERE status='pending'",
      )
      .get().n === 1,
    "confirmation persists a real reminder schedule",
  );
  await page.getByRole("button", { name: "取消提醒", exact: true }).click();
  await page.getByText("这条提醒已取消", { exact: true }).waitFor();
  failModel = true;
  await page.getByLabel("和球球说句话", { exact: true }).fill("失败测试");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(
    await page.getByRole("button", { name: "重试", exact: true }).isVisible(),
    "provider failure exposes retry instead of fabricated success",
  );
  failModel = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page.waitForTimeout(1000);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(100);
    check(
      await page.locator(".companion-chat").evaluate((el) => {
        const r = el.querySelector(".chat-composer").getBoundingClientRect();
        return (
          el.scrollWidth <= innerWidth && r.bottom <= innerHeight && r.left >= 0
        );
      }),
      `${width}px composer stays within safe viewport`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-chat.png`),
  });
  await page.evaluate(() => window.qa.theme("dark"));
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-dark.png`),
  });
  await page.getByRole("button", { name: "关闭球球聊天", exact: true }).click();
  await page.locator(".companion-chat").waitFor({ state: "detached" });
  check(await ball.isVisible(), "closing chat returns the original ball");
  await hold();
  check(
    (await page.getByText("有事就问我吧。", { exact: true }).count()) > 0,
    "chat history survives closing and reopening",
  );
  await page.evaluate(() => window.DormNativeBack());
  await page.locator(".companion-chat").waitFor({ state: "detached" });
  check(true, "native back closes chat without navigating out of dorm");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await hold();
  check(
    await page
      .getByTestId("chat-ball")
      .evaluate((el) => el.getAnimations().length === 0),
    "reduced-motion opens at final ball pose",
  );
  await page.getByRole("button", { name: "清空聊天记录", exact: true }).click();
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await page.getByText("有事就问球球。", { exact: true }).waitFor();
  check(
    h.db.sqlite.prepare("SELECT COUNT(*) n FROM companion_messages").get().n ===
      0,
    "clear history requires confirmation and clears persisted messages",
  );
  check(errors.length === 0, "no browser runtime errors");
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
  await runtime?.close();
  h.close();
  await fs.rm(html, { force: true });
  await fs.rm(vue, { force: true });
}

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
let browser, server, runtime, page;
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
      base_url: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen2.5-7B-Instruct",
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
  page = await browser.newPage({
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
        window.chatFrames.push({
          x: r.x,
          y: r.y,
          width: r.width,
          toolbar: Number(
            getComputedStyle(document.querySelector(".chat-toolbar")).opacity,
          ),
          history: Number(
            getComputedStyle(document.querySelector(".chat-history-frame"))
              .opacity,
          ),
          footer: Number(
            getComputedStyle(document.querySelector(".chat-footer")).opacity,
          ),
        });
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
  check(
    await page.evaluate(() => document.activeElement?.tagName !== "TEXTAREA"),
    "opening chat never summons a keyboard",
  );
  check(
    (await page.locator(".chat-toolbar button").count()) === 1 &&
      (await page
        .getByRole("button", { name: "返回宿舍", exact: true })
        .isVisible()),
    "toolbar contains only the back chevron",
  );
  check(
    (await page.locator(".chat-bubble.assistant").count()) === 3 &&
      (await page
        .getByRole("button", { name: "今天做什么？", exact: true })
        .isVisible()),
    "entry offers three short greetings and ready-to-send questions",
  );
  check(
    await page.evaluate(() =>
      window.chatFrames.some(
        (f) => f.toolbar > f.footer + 0.08 && f.history > 0 && f.footer < 0.95,
      ),
    ),
    "entry parts fade in with distinct intermediate timing",
  );
  check(
    await page
      .locator(".chat-masthead")
      .evaluate(
        (el) =>
          getComputedStyle(el).backdropFilter.includes("blur") &&
          getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)",
      ),
    "top has a translucent frosted surface",
  );
  check(
    await page
      .getByTestId("chat-composer")
      .evaluate((el) => innerHeight - el.getBoundingClientRect().bottom >= 45),
    "composer sits above the bottom safe gap",
  );
  check(
    (await page
      .getByRole("button", { name: "切换语音输入", exact: true })
      .count()) === 0,
    "chat is text-only with no microphone entry",
  );
  const editor = page.getByLabel("和球球说句话", { exact: true });
  await editor.click();
  check(
    await editor.evaluate(
      (el) => document.activeElement !== el && !el.readOnly,
    ),
    "first tap arms editing without forcing keyboard focus",
  );
  const inputBox = await editor.boundingBox();
  await page.mouse.move(inputBox.x + 12, inputBox.y + 12);
  await page.mouse.down();
  await page.waitForTimeout(70);
  check(
    await page
      .locator(".composer-text")
      .evaluate(
        (el) =>
          getComputedStyle(el).transform !== "none" &&
          new DOMMatrix(getComputedStyle(el).transform).d < 0.99,
      ),
    "input press visibly squashes its glass surface",
  );
  await page.mouse.up();
  await page.waitForTimeout(550);
  check(
    await page
      .locator(".composer-text")
      .evaluate(
        (el) =>
          Math.abs(new DOMMatrix(getComputedStyle(el).transform).d - 1) < 0.002,
      ),
    "input release springs back without moving its layout",
  );
  await page.getByTestId("chat-history").evaluate((el) => {
    el.scrollTop = 0;
  });
  const track = page.locator(".chat-history-content"),
    rect = await page.getByTestId("chat-history").boundingBox();
  await page.mouse.move(rect.x + rect.width - 12, rect.y + 28);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 12, rect.y + 120, { steps: 8 });
  check(
    await track.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).f > 15,
    ),
    "top boundary drag follows with rubber resistance",
  );
  await page.mouse.up();
  await page.waitForTimeout(700);
  check(
    await track.evaluate(
      (el) => Math.abs(new DOMMatrix(getComputedStyle(el).transform).f) < 0.5,
    ),
    "timeline settles back to its original boundary",
  );
  if (!safari) {
    const touch = await page.context().newCDPSession(page);
    const tx = rect.x + rect.width - 10,
      ty = rect.y + 24;
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: tx, y: ty }],
    });
    for (let i = 1; i <= 8; i++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: tx, y: ty + i * 10 }],
      });
    check(
      await track.evaluate(
        (el) => new DOMMatrix(getComputedStyle(el).transform).f > 12,
      ),
      "real touch event stream keeps boundary rubber tracking despite pointer cancellation",
    );
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(700);
    check(
      await track.evaluate(
        (el) => Math.abs(new DOMMatrix(getComputedStyle(el).transform).f) < 0.5,
      ),
      "touch release restores the timeline",
    );
    await touch.detach();
  }
  const chatBall = page.locator(".chat-ball .dorm-companion");
  const emotionBefore = await chatBall.evaluate(
    (el) => el.querySelector("svg")?.outerHTML,
  );
  await chatBall.click();
  await page.waitForTimeout(250);
  check(
    await chatBall.evaluate(
      (el, old) => el.querySelector("svg")?.outerHTML !== old,
      emotionBefore,
    ),
    "chat ball remains interactive",
  );
  await editor.fill("输入法候选");
  await page
    .getByLabel("和球球说句话", { exact: true })
    .dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      isComposing: true,
      bubbles: true,
    });
  check(
    (await page.getByLabel("和球球说句话", { exact: true }).inputValue()) ===
      "输入法候选" && (await page.locator(".chat-bubble.user").count()) === 0,
    "Chinese IME confirmation never sends an unfinished message",
  );
  await page.getByLabel("和球球说句话", { exact: true }).fill("你好");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page
    .getByRole("status", { name: "球球正在思考", exact: true })
    .waitFor();
  check(
    (await page.locator(".chat-thinking i").count()) === 3,
    "thinking uses three floating vertical strokes",
  );
  check(true, "thinking pre-message is visible while provider is pending");
  await page.getByText("有事就问我吧。", { exact: true }).waitFor();
  check(
    (await page.locator(".chat-bubble.user").count()) === 1,
    "composition candidate confirmation never creates a hidden chat request",
  );
  check(
    (await page.locator(".chat-bubble.assistant").count()) === 5,
    "reply is split into individual short glass bubbles",
  );
  check(
    (await page.locator(".chat-ball").getByRole("img").count()) === 0,
    "ball uses its existing expression engine, not remote images",
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
  await page
    .getByLabel("和球球说句话", { exact: true })
    .fill("一小时后再提醒我一次");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByRole("button", { name: "确认安排", exact: true }).click();
  await page.getByText("已安排提醒", { exact: true }).waitFor();
  h.db.sqlite
    .prepare(
      "UPDATE companion_reminder_actions SET status='sent' WHERE status='pending'",
    )
    .run();
  await page.getByRole("button", { name: "取消提醒", exact: true }).click();
  await page.getByText("这条提醒已经发出", { exact: true }).waitFor();
  check(
    true,
    "cancel racing with delivery reports sent instead of claiming cancellation",
  );
  failModel = true;
  await page.getByLabel("和球球说句话", { exact: true }).fill("失败测试");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(
    await page.getByRole("button", { name: "重试", exact: true }).isVisible(),
    "provider failure exposes retry instead of fabricated success",
  );
  await page.waitForTimeout(420);
  check(
    await page.getByRole("alert").evaluate((el) => {
      const r = el.getBoundingClientRect(),
        input = document
          .querySelector(".chat-composer")
          .getBoundingClientRect();
      return (
        r.width >= innerWidth - 30 &&
        r.height >= 75.5 &&
        r.bottom < input.top - 25 &&
        !el.querySelector("[aria-label*=关闭]")
      );
    }),
    "error notice is wider, raised and has no close cross",
  );
  await page.waitForTimeout(5900);
  check(
    (await page.getByRole("alert").count()) === 0,
    "error notice animates away automatically",
  );
  await page.getByLabel("和球球说句话", { exact: true }).fill("再次失败测试");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByRole("alert").waitFor();
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
  await page.getByTestId("chat-history").evaluate((el) => {
    window.savedChatScroll = el.scrollTop;
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  check(
    await page
      .getByTestId("chat-top-frost")
      .evaluate((el) => Number(getComputedStyle(el).opacity) === 0),
    "top frost does not obscure the first message at the start of history",
  );
  await page.getByTestId("chat-history").evaluate((el) => {
    el.scrollTop = window.savedChatScroll;
    el.dispatchEvent(new Event("scroll"));
  });
  check(
    await page
      .getByTestId("chat-top-frost")
      .evaluate(
        (el) =>
          getComputedStyle(el).opacity === "1" &&
          el.children.length === 5 &&
          [...el.children].every((i) =>
            getComputedStyle(i).maskImage.includes("gradient"),
          ),
      ),
    "scrolled messages pass through five graded frost layers instead of a hard upper cut",
  );
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-chat.png`),
  });
  await page.evaluate(() => window.qa.theme("dark"));
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-dark.png`),
  });
  await page.evaluate(() => {
    window.chatCloseFrames = [];
    document.querySelector(".chat-toolbar button").addEventListener(
      "pointerdown",
      () => {
        const start = performance.now();
        function frame() {
          const ball = document.querySelector(".chat-ball"),
            footer = document.querySelector(".chat-footer");
          if (ball)
            window.chatCloseFrames.push({
              width: ball.getBoundingClientRect().width,
              opacity: Number(getComputedStyle(footer).opacity),
            });
          if (performance.now() - start < 1300) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      },
      { once: true },
    );
  });
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await page.locator(".companion-chat").waitFor({ state: "detached" });
  check(
    await page.evaluate(() =>
      window.chatCloseFrames.some(
        (f) => f.width > 54 && f.width < 85 && f.opacity < 0.9,
      ),
    ),
    "closing keeps intermediate ball poses while parts withdraw in reverse",
  );
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
  await page.getByText("我在，想问什么？", { exact: true }).waitFor();
  check(
    h.db.sqlite.prepare("SELECT COUNT(*) n FROM companion_messages").get().n ===
      0,
    "clear history requires confirmation and clears persisted messages",
  );
  await page.getByRole("button", { name: "今天做什么？", exact: true }).click();
  await page.getByText("有事就问我吧。", { exact: true }).waitFor();
  check(
    (await page.locator(".chat-bubble.user").count()) === 1 &&
      (await page.locator(".chat-bubble.user").innerText()) === "今天做什么？",
    "preset question sends a real chat only after user taps it",
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
} catch (error) {
  if (page) {
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          text: document.body.innerText,
          composerFrames: window.composerFrames,
          hidden: document.hidden,
          motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          voiceSupport: !!navigator.mediaDevices?.getUserMedia,
          voiceWidth: document
            .querySelector('[data-testid="chat-voice"]')
            ?.getBoundingClientRect().width,
        })),
      ),
    );
    await page
      .screenshot({ path: path.join(evidence, "failure.png") })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  server?.kill();
  await runtime?.close();
  h.close();
  await fs.rm(html, { force: true });
  await fs.rm(vue, { force: true });
}

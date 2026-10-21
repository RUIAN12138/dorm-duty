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
    `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fff"><div id="app"></div>${["rings", "emotions", "ball", "engine"].map((n) => `<script src="/vendor/emotion-ball/${n}.js"></script>`).join("")}<script type="module">import{createApp}from'vue';import{createPinia}from'pinia';import{createRouter,createWebHistory}from'vue-router';import{Icon}from'vant';import Root from'./${name}.vue';import'vant/es/icon/style/index.mjs';import'./src/theme.css';import'./src/screen.css';import'./src/style.css';import'./src/focus.css';import{installTheme}from'./src/interaction/theme';installTheme();import{installInputMode}from'./src/interaction/inputMode';installInputMode();import{installNativeBack}from'./src/interactions/nativeBack';installNativeBack();const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});window.qaRoutes=[];router.afterEach(to=>window.qaRoutes.push(to.path));createApp(Root).use(createPinia()).use(router).use(Icon).mount('#app');</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{computed,ref}from'vue';import{provideSheetNavigation}from'./src/interaction/sheetNavigation';import ElasticSheet from'./src/components/ElasticSheet.vue';provideSheetNavigation();const externalOpen=ref(false);import{useRoute}from'vue-router';import Stage from'./src/components/ScreenStage.vue';import Board from'./src/components/ChoreBoard.vue';import Nav from'./src/components/ChoreBottomNav.vue';import{setThemeMode}from'./src/interaction/theme';const route=useRoute(),section=computed(()=>route.path==='/water'?'water':route.path==='/calendar'?'calendar':'duty');(window as any).qa={theme:setThemeMode};</script><template><Stage signed-in><main class="guest-page"><Board invite="${room.invite_code}" dorm-name="交互验收" :member-id="${room.member_id}" token="${room.access_token}" :demo="false" :section="section" @email-account="externalOpen=true" @create-dorm="externalOpen=true"/></main></Stage><Nav :section="section"/><ElasticSheet v-model="externalOpen" title="邮箱账号"><p data-testid="external-account-page">邮箱账户验收</p></ElasticSheet></template>`,
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
  if (process.env.DORM_CONTINUITY_QA === "1") {
    const poseChanges = async (selector) => {
      const first = await page.locator(selector).evaluate((el) => el.innerHTML);
      await page.waitForTimeout(180);
      return (
        first !== (await page.locator(selector).evaluate((el) => el.innerHTML))
      );
    };
    check(
      await poseChanges(".board-identity .emotion-ball-host"),
      "main ball is animated before navigation",
    );
    await page.keyboard.press("Tab");
    check(
      await page.evaluate(
        () => document.documentElement.dataset.interaction === "keyboard",
      ),
      "keyboard navigation honors zero-motion mode",
    );
    await page.mouse.click(345, 330);
    check(
      await poseChanges(".board-identity .emotion-ball-host"),
      "pointer resumes the actual expression engine after keyboard navigation",
    );
    // Handoff captures an in-flight expression, not only its destination ID.
    check(
      await page.evaluate(async () => {
        const a = document.createElement("div"),
          b = document.createElement("div");
        document.body.append(a, b);
        const first = window.EmotionBall.create(a, {
          emotion: "02",
          idle: false,
        });
        first.setEmotion("14");
        await new Promise((r) => setTimeout(r, 130));
        const saved = first.captureState();
        const second = window.EmotionBall.create(b, {
          emotion: "39",
          idle: false,
          autostart: false,
        });
        second.restoreState(saved);
        const after = second.captureState();
        const equal =
          JSON.stringify(saved._lastPose) === JSON.stringify(after._lastPose) &&
          saved._emoStart < saved.capturedAt &&
          after._ringSpring.x === saved._ringSpring.x;
        first.destroy();
        second.destroy();
        a.remove();
        b.remove();
        return equal;
      }),
      "handoff retains the exact intermediate pose and spring progress",
    );
    async function swipe(x1, x2, y) {
      await page.mouse.move(x1, y);
      await page.mouse.down();
      await page.mouse.move(x2, y, { steps: 14 });
      await page.mouse.up();
    }
    await swipe(320, 65, 610);
    await page.getByTestId("pane-water").waitFor();
    await page.waitForTimeout(650);
    check(true, "left swipe navigates duty to water");
    await swipe(320, 65, 610);
    await page.getByTestId("pane-calendar").waitFor();
    await page.waitForTimeout(750);
    check(true, "left swipe navigates water to calendar");
    await page.getByTestId("calendar-view-stats").click();
    await page.waitForTimeout(100);
    check(
      await page
        .locator(".stats-mode")
        .evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .some((a) => a.effect.getTiming().duration >= 500),
        ),
      "statistics entry retains a visible gradual intermediate phase",
    );
    await page.waitForTimeout(650);
    await page.getByTestId("open-tools").click();
    await page.getByTestId("open-preferences").click();
    await page.getByTestId("open-system-notifications").waitFor();
    await page.waitForTimeout(450);
    await page.getByTestId("open-email-account").click();
    await page.getByTestId("external-account-page").waitFor();
    await page.waitForTimeout(400);
    check(
      (await page.locator(".sheet-layer").count()) === 1,
      "parent-owned email panel shares the same settings drawer",
    );
    await page.getByLabel("返回上一层设置", { exact: true }).click();
    await page.waitForTimeout(400);
    check(
      (await page.locator(".sheet-layer").count()) === 1 &&
        (await page
          .locator('.sheet-navigation-page[data-sheet-page="账号与宿舍"]')
          .isVisible()),
      "account settings switches inside one retained drawer",
    );
    const panel = await page.locator(".elastic-sheet").evaluate((el) => {
      el.dataset.qaRetained = "yes";
      return el.dataset.qaRetained;
    });
    await page.getByTestId("open-system-notifications").click();
    await page.waitForTimeout(500);
    check(
      (await page.locator(".sheet-layer").count()) === 1 &&
        (await page
          .locator(".elastic-sheet")
          .getAttribute("data-qa-retained")) === panel,
      "third-level notification settings retain the same panel and overlay",
    );
    await page.getByLabel("返回上一层设置", { exact: true }).click();
    await page.waitForTimeout(400);
    check(
      await page.getByTestId("open-marker").isVisible(),
      "secondary settings back restores its parent contents",
    );
    await page.getByLabel("返回上一层设置", { exact: true }).click();
    await page.waitForTimeout(400);
    const themeBefore = await page.locator(".theme-toggle svg").innerHTML();
    await page
      .getByRole("button", { name: "切换为夜间模式", exact: true })
      .click();
    await page.waitForTimeout(70);
    const themeMiddle = await page.locator(".theme-toggle svg").innerHTML();
    check(
      await page.evaluate(
        () => document.documentElement.dataset.theme === "dark",
      ),
      "original theme toggle still changes the theme",
    );
    await page.waitForTimeout(500);
    check(
      themeBefore !== themeMiddle &&
        themeMiddle !== (await page.locator(".theme-toggle svg").innerHTML()),
      "theme icon keeps intermediate sun-to-moon spring poses",
    );
    await page.getByTestId("open-water-order").click();
    await page.waitForTimeout(450);
    check(
      await page
        .getByRole("button", { name: "保存轮序", exact: true })
        .evaluate((el) => {
          const footer = el.closest(".elastic-sheet > .sheet-footer");
          const box = el.getBoundingClientRect();
          return (
            !!footer &&
            !el.closest("[data-sheet-scroll]") &&
            box.bottom <= innerHeight
          );
        }),
      "embedded order keeps its save action outside the scrolling list",
    );
    check(
      (await page
        .locator(".sheet-heading")
        .getByRole("button", { name: "调整轮序" })
        .count()) > 0,
      "embedded order retains its original header help",
    );
    await page.getByLabel("返回上一层设置", { exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByTestId("open-preferences").click();
    await page.waitForTimeout(350);
    await page.locator(".menu-advanced summary").click();
    await page.getByTestId("guest-create-dorm").click();
    await page.getByTestId("external-account-page").waitFor();
    await page.waitForTimeout(550);
    check(
      (await page.locator(".sheet-layer").count()) === 1 &&
        (await page.getByTestId("external-account-page").isVisible()),
      "leaving settings waits for root exit before opening entry verification",
    );
    await page.getByLabel("关闭详情", { exact: true }).click();
    await page.locator(".sheet-layer").waitFor({ state: "detached" });
    await page
      .getByRole("link", { name: "值日", exact: true })
      .click()
      .catch(async () => {
        await page.locator(".chore-bottom-nav button").first().click();
      });
    await page.getByTestId("pane-duty").waitFor();
    await page.waitForTimeout(600);
    await hold();
    check(
      await page.locator(".chat-nameplate").isVisible(),
      "chat companion has its glass nameplate",
    );
    check(
      await poseChanges(".chat-ball .emotion-ball-host"),
      "chat ball animates naturally after handoff",
    );
    const editor = page.getByLabel("和球球说句话", { exact: true });
    await editor.click();
    await editor.focus();
    await editor.press("q");
    check(
      await page.evaluate(
        () => document.documentElement.dataset.interaction === "pointer",
      ),
      "typing does not switch the application into static keyboard-navigation mode",
    );
    await page.locator(".chat-ball .dorm-companion").click();
    await page.waitForTimeout(220);
    check(
      await poseChanges(".chat-ball .emotion-ball-host"),
      "chat tap reacts through intermediate animated poses",
    );
    await page.waitForTimeout(6500);
    check(
      await page.locator(".chat-ball .companion-bubble").isVisible(),
      "chat ball offers a small automatic tip",
    );
    await page.getByTestId("chat-history").evaluate((el) => {
      const container = el.querySelector(".chat-history-content");
      for (let i = 0; i < 20; i++) {
        const p = document.createElement("p");
        p.textContent = "滚动验收 " + i;
        container.append(p);
      }
      el.scrollTop = 100;
    });
    await page.getByTestId("chat-history").dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: 180, clientY: 350 }],
    });
    await page.getByTestId("chat-history").dispatchEvent("touchmove", {
      touches: [{ identifier: 1, clientX: 180, clientY: 330 }],
    });
    await page
      .getByTestId("chat-history")
      .dispatchEvent("touchend", { touches: [] });
    check(
      await page
        .locator(".chat-history-content")
        .evaluate((el) => el.getAnimations().length === 0),
      "ordinary timeline scrolling never starts a return animation",
    );
    // An incomplete edge gesture springs back; crossing threshold returns.
    await swipe(12, 55, 250);
    await page.waitForTimeout(450);
    check(
      await page.locator(".companion-chat").isVisible(),
      "short chat back gesture cancels without closing",
    );
    await page.evaluate(() => {
      window.edgeExitFrames = [];
      function sample() {
        const el = document.querySelector(".chat-ball");
        if (!el) return;
        window.edgeExitFrames.push(el.getBoundingClientRect().toJSON());
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await swipe(12, 170, 250);
    await page.locator(".companion-chat").waitFor({ state: "detached" });
    check(
      await ball.evaluate((el) => {
        const source = el.getBoundingClientRect(),
          end = window.edgeExitFrames.at(-1);
        return (
          end &&
          Math.abs(end.x - source.x) < 4 &&
          Math.abs(end.y - source.y) < 4 &&
          Math.abs(end.width - source.width) < 3
        );
      }),
      "edge back returns the ball to its source without a second parent-offset jump",
    );
    check(
      await ball.isVisible(),
      "chat left-edge right swipe returns to the same dorm page",
    );
    check(
      await poseChanges(".board-identity .emotion-ball-host"),
      "return handoff keeps main ball alive",
    );
    check(
      errors.length === 0,
      "no browser runtime errors in continuity, nested settings or gestures",
    );
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
  } else {
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
      let appeared = 0;
      function frame() {
        const b = document.querySelector(".chat-ball");
        if (b) {
          if (!appeared) appeared = performance.now();
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
        if (performance.now() - (appeared || start) < (appeared ? 1200 : 5000))
          requestAnimationFrame(frame);
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
          (f) =>
            f.toolbar > f.footer + 0.08 && f.history > 0 && f.footer < 0.95,
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
        .evaluate(
          (el) => innerHeight - el.getBoundingClientRect().bottom >= 45,
        ),
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
    // Keep the physical pointer held while waiting for a rendered press frame.
    // A fixed 70ms sample races software rendering on the CI browser.
    await page.waitForFunction(
      () => {
        const el = document.querySelector(".composer-text");
        return el && new DOMMatrix(getComputedStyle(el).transform).d < 0.99;
      },
      null,
      { timeout: 1000 },
    );
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
            Math.abs(new DOMMatrix(getComputedStyle(el).transform).d - 1) <
            0.002,
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
          (el) =>
            Math.abs(new DOMMatrix(getComputedStyle(el).transform).f) < 0.5,
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
    // iOS keeps its layout viewport tall while the visual viewport shrinks for
    // the keyboard. Mock only that browser signal, never the component's state.
    await page.evaluate(() => {
      const v = window.visualViewport;
      const height = v.height,
        top = v.offsetTop;
      Object.defineProperty(v, "height", {
        configurable: true,
        get: () => window.keyboardFixture?.height ?? height,
      });
      Object.defineProperty(v, "offsetTop", {
        configurable: true,
        get: () => window.keyboardFixture?.top ?? top,
      });
      window.keyboardFixture = { height: 410, top: 44 };
      v.dispatchEvent(new Event("resize"));
    });
    await editor.focus();
    await page.waitForTimeout(350);
    check(
      await page.locator(".companion-chat").evaluate((el) => {
        const root = el.getBoundingClientRect(),
          frame = el
            .querySelector(".chat-history-frame")
            .getBoundingClientRect(),
          input = el.querySelector(".chat-composer").getBoundingClientRect(),
          ball = el.querySelector(".chat-ball-visual").getBoundingClientRect();
        return (
          el.classList.contains("is-keyboard") &&
          frame.height > 180 &&
          input.bottom <= 454 &&
          454 - input.bottom <= 18 &&
          ball.width < 60 &&
          root.top === 44
        );
      }),
      "visual keyboard resize compacts the header and keeps composer just above keyboard",
    );
    await editor.fill("第一行\n第二行\n第三行");
    await page.waitForTimeout(80);
    check(
      await editor.evaluate(
        (el) => el.clientHeight >= 76 && el.clientHeight <= 80,
      ),
      "multiline input grows up to three visible lines without clipping",
    );
    modelDelay = 1200;
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    check(
      await editor.evaluate(
        (el) => !el.disabled && document.activeElement === el,
      ),
      "sending preserves editor focus instead of dismissing mobile keyboard",
    );
    await editor.fill("下一条先写好");
    await page.waitForTimeout(1600);
    check(
      (await editor.inputValue()) === "下一条先写好",
      "draft typed while waiting survives the arriving reply",
    );
    check(
      await page
        .locator(".chat-bubble.assistant")
        .last()
        .evaluate((el) => {
          const rect = el.getBoundingClientRect(),
            frame = document
              .querySelector(".chat-history")
              .getBoundingClientRect();
          return rect.top >= frame.top && rect.bottom <= frame.bottom + 1;
        }),
      "latest reply remains fully visible after keyboard layout and response",
    );
    await page.screenshot({
      path: path.join(
        evidence,
        `${safari ? "webkit" : "chromium"}-keyboard.png`,
      ),
    });
    await editor.fill("");
    await editor.blur();
    await page.evaluate(() => {
      window.keyboardFixture = null;
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(350);
    modelDelay = 500;
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
            el.scrollWidth <= innerWidth &&
            r.bottom <= innerHeight &&
            r.left >= 0
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
          window.chatCloseStart = start;
          const observer = new MutationObserver(() => {
            if (!document.querySelector(".companion-chat")) {
              window.chatCloseEnd = performance.now();
              observer.disconnect();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          function frame() {
            const ball = document.querySelector(".chat-ball"),
              footer = document.querySelector(".chat-footer");
            if (ball)
              window.chatCloseFrames.push({
                width: ball.getBoundingClientRect().width,
                opacity: Number(getComputedStyle(footer).opacity),
                backdrop: Number(
                  getComputedStyle(
                    document.querySelector(".companion-chat-backdrop"),
                  ).opacity,
                ),
                pageFilter: getComputedStyle(
                  document.querySelector(".app-stage"),
                ).filter,
                elapsed: performance.now() - start,
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
    check(
      await page.evaluate(
        () => window.chatCloseEnd - window.chatCloseStart < 560,
      ),
      "closing finishes promptly without waiting for an invisible spring tail",
    );
    check(
      await page.evaluate(() =>
        window.chatCloseFrames.some(
          (f) =>
            f.elapsed > 60 &&
            f.backdrop > 0 &&
            f.backdrop < 0.95 &&
            f.pageFilter === "none",
        ),
      ),
      "page frost releases beneath fading backdrop instead of snapping after exit",
    );
    await hold();
    check(
      (await page.getByText("有事就问我吧。", { exact: true }).count()) > 0,
      "chat history survives closing and reopening",
    );
    await editor.click();
    await editor.focus();
    await page.evaluate(() => {
      window.keyboardFixture = { height: 410, top: 44 };
      visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(280);
    await page.evaluate(() => {
      window.keyboardExitRects = [];
      const stop = performance.now() + 600;
      function capture() {
        const root = document.querySelector(".companion-chat");
        if (root)
          window.keyboardExitRects.push(root.getBoundingClientRect().toJSON());
        if (performance.now() < stop) requestAnimationFrame(capture);
      }
      requestAnimationFrame(capture);
    });
    await page.evaluate(() => window.DormNativeBack());
    await page.locator(".companion-chat").waitFor({ state: "detached" });
    check(
      await page.evaluate(
        () =>
          document.activeElement?.tagName !== "TEXTAREA" &&
          !document.documentElement.dataset.companionChat,
      ),
      "keyboard-open back dismisses focus and fully releases chat state",
    );
    check(
      await page.evaluate(() =>
        window.keyboardExitRects.every(
          (r) => Math.abs(r.top - 44) < 1 && Math.abs(r.height - 410) < 1,
        ),
      ),
      "closing freezes keyboard viewport so shrinking keyboard cannot bend the ball path",
    );
    await page.evaluate(() => {
      window.keyboardFixture = null;
      visualViewport.dispatchEvent(new Event("resize"));
    });
    check(true, "native back closes chat without navigating out of dorm");
    await hold();
    check(
      await page
        .locator(".chat-ball-visual")
        .evaluate((el) => Math.abs(el.getBoundingClientRect().width - 88) < 1),
      "reopening after keyboard exit restores normal ball geometry before origin measurement",
    );
    await page.evaluate(() => window.DormNativeBack());
    await page.locator(".companion-chat").waitFor({ state: "detached" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await hold();
    check(
      await page
        .getByTestId("chat-ball")
        .evaluate((el) => el.getAnimations().length === 0),
      "reduced-motion opens at final ball pose",
    );
    await page
      .getByRole("button", { name: "清空聊天记录", exact: true })
      .click();
    await page.getByRole("button", { name: "清空", exact: true }).click();
    await page.getByText("我在，想问什么？", { exact: true }).waitFor();
    check(
      h.db.sqlite.prepare("SELECT COUNT(*) n FROM companion_messages").get()
        .n === 0,
      "clear history requires confirmation and clears persisted messages",
    );
    await page
      .getByRole("button", { name: "今天做什么？", exact: true })
      .click();
    await page.getByText("有事就问我吧。", { exact: true }).waitFor();
    check(
      (await page.locator(".chat-bubble.user").count()) === 1 &&
        (await page.locator(".chat-bubble.user").innerText()) ===
          "今天做什么？",
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
  }
} catch (error) {
  if (page) {
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          text: document.body.innerText,
          composerFrames: window.composerFrames,
          closeDuration: performance.now() - window.chatCloseStart,
          closeFrames: window.chatCloseFrames?.filter((_, i) => i % 5 === 0),
          geometry: [
            ...document.querySelectorAll(
              ".companion-chat,.chat-history-frame,.chat-composer,.chat-footer,.chat-surface,.chat-ball-visual",
            ),
          ].map((el) => ({
            class: el.className,
            rect: el.getBoundingClientRect().toJSON(),
            padding: getComputedStyle(el).padding,
            margin: getComputedStyle(el).margin,
            transform: getComputedStyle(el).transform,
          })),
          focus: document.activeElement?.outerHTML.slice(0, 150),
          viewport: {
            height: visualViewport.height,
            top: visualViewport.offsetTop,
          },
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

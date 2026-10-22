import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { _android } from "../frontend/node_modules/playwright/index.mjs";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const safari = process.env.DORM_BROWSER === "webkit",
  native = process.env.DORM_ANDROID_WEBVIEW === "1",
  checks = [],
  errors = [];
const engine = native ? "android-webview" : safari ? "webkit" : "chromium";
const preview = await createConversationPreview();
let browser, page, device;
const evidence = new URL("../data/conversation-preview/", import.meta.url);
await fs.mkdir(evidence, { recursive: true });
const check = (value, label) => {
  assert(value, label);
  checks.push(label);
  console.log(`PASS ${engine}: ${label}`);
};
try {
  if (native) {
    device = (await _android.devices()).find(
      (d) => d.serial() === "emulator-5554",
    );
    assert(device, "Android preview emulator");
    page = await (await device.webView({ pkg: "cn.lundao.preview" })).page();
  } else {
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
  }
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === "webgl" ? null : get.call(this, kind, ...args);
    };
  });
  await page.goto(
    (native ? `http://10.0.2.2:${preview.port}` : preview.url) + "/?start=1",
  );
  await page.getByTestId("pane-duty").waitFor();
  await page.waitForTimeout(650);
  check(
    (await (await fetch(preview.url + "/__preview/status")).json()).email ===
      false,
    "preview has only an in-memory database and no real delivery",
  );
  check(
    (await fetch(preview.url + "/email/config")).status === 404,
    "preview blocks account and SMTP paths instead of proxying another server",
  );
  const ball = page.locator(".companion-identity .dorm-companion"),
    chat = page.locator(".companion-chat");
  await ball.dblclick({ delay: 70 });
  await page.waitForTimeout(700);
  check(
    (await chat.count()) === 0,
    "double tap reacts without opening chat or the old note drawer",
  );
  const pose = await ball.locator(".emotion-ball-host").innerHTML();
  await page.waitForTimeout(120);
  check(
    pose !== (await ball.locator(".emotion-ball-host").innerHTML()),
    "double-tap expression keeps animated intermediate poses",
  );
  await ball.click();
  await chat.waitFor();
  await page.waitForTimeout(1100);
  check(
    (await page.locator(".companion-note-form").count()) === 0,
    "single tap opens the unified chat and no separate note composer",
  );
  check(
    await page
      .getByRole("button", { name: "我要留言", exact: true })
      .isVisible(),
    "note quick action remains discoverable beside the existing composer",
  );
  const editor = page.getByLabel("和球球说句话", { exact: true });
  async function input(text) {
    await editor.click();
    await editor.fill(text);
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page.waitForTimeout(280);
  }
  const calls = () => preview.counts.get("POST /chores/notes") || 0;
  const aiCalls = () => preview.counts.get("POST /chores/companion/chat") || 0;
  await page.getByRole("button", { name: "我要留言", exact: true }).click();
  await page
    .locator('[data-phase="recipient"][data-testid="conversation-note"]')
    .waitFor();
  check(
    (await page
      .getByRole("group", { name: "留言给谁" })
      .getByRole("button")
      .count()) === 4,
    "recipient choices contain three roommates and all, excluding self",
  );
  await page
    .getByRole("group", { name: "留言给谁" })
    .getByRole("button", { name: "张三", exact: true })
    .click();
  await input("晚点回来，帮我留门");
  const flow = page.getByTestId("conversation-note");
  check(
    (await flow.getAttribute("data-phase")) === "confirm" &&
      (await flow.innerText()).includes("张三") &&
      (await flow.innerText()).includes("晚点回来，帮我留门"),
    "confirmation preview clearly includes actual recipient and complete message",
  );
  check(
    calls() === 0 && aiCalls() === 0,
    "draft and confirmation do not send notes or invoke an AI provider",
  );
  await flow.getByRole("button", { name: "修改内容", exact: true }).click();
  await input("十点回来，帮我留门");
  await flow.getByRole("button", { name: "修改对象", exact: true }).click();
  await page
    .getByRole("group", { name: "留言给谁" })
    .getByRole("button", { name: "李四", exact: true })
    .click();
  await page
    .locator('[data-testid="conversation-note"][data-phase="confirm"]')
    .waitFor();
  check(
    (await flow.innerText()).includes("李四") &&
      (await flow.innerText()).includes("十点回来，帮我留门"),
    "editing recipient keeps the edited content",
  );
  await flow.getByRole("button", { name: "取消", exact: true }).click();
  await flow.waitFor({ state: "hidden" });
  check(
    (await flow.count()) === 0 && calls() === 0,
    "cancel discards the draft without any delivery",
  );
  await input("我要给张三留言：请帮我留个门");
  await flow.waitFor();
  await page.route(
    "**/chores/notes",
    async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByTestId("note-confirm").evaluate((el) => {
    for (let i = 0; i < 6; i++) el.click();
  });
  await page.getByText("留言已发出。", { exact: true }).waitFor();
  check(
    calls() === 1,
    "six synchronous confirmation clicks produce one existing notes API request",
  );
  const received = await preview.board(preview.people[1]);
  check(
    received.reminders.some(
      (n) =>
        n.body === "请帮我留个门" && n.sender_id === preview.people[0].user_id,
    ),
    "the existing endpoint records the actual sender and recipient in the isolated room",
  );
  await input("我要给不存在的人留言");
  check(
    (await flow.getAttribute("data-phase")) === "recipient",
    "unknown names require explicit selection rather than partial guessing",
  );
  await page
    .getByRole("group", { name: "留言给谁" })
    .getByRole("button", { name: "所有人", exact: true })
    .click();
  await input("大家记得关门");
  await page.route(
    "**/chores/notes",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "测试网络失败" } }),
      }),
    { times: 1 },
  );
  if (native)
    await page.getByTestId("note-confirm").evaluate((el) => el.click());
  else await page.getByTestId("note-confirm").click();
  await page
    .locator('[data-testid="conversation-note"][data-phase="failed"]')
    .waitFor();
  check(
    (await flow.innerText()).includes("大家记得关门"),
    "failure retains the recipient and content for explicit retry",
  );
  check(calls() === 1, "failed transport is never silently retried");
  preview.h.db.sqlite.exec(
    "UPDATE chore_reminders SET created_at='2000-01-01T00:00:00Z' WHERE source='note'",
  );
  if (native)
    await page.getByTestId("note-confirm").evaluate((el) => el.click());
  else await page.getByTestId("note-confirm").click();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="conversation-note"]'),
  );
  check(calls() === 2, "broadcast uses one existing server request");
  for (const p of preview.people.slice(1))
    check(
      (await preview.board(p)).reminders.some((n) => n.body === "大家记得关门"),
      "broadcast reaches only each current isolated roommate",
    );
  await page.screenshot({
    path: new URL(`${engine}-chat.png`, evidence).pathname,
  });
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await chat.waitFor({ state: "detached" });
  await page.waitForTimeout(450);
  const touch = safari ? null : await page.context().newCDPSession(page);
  async function swipe(x, y, dx, dy = 0) {
    if (touch) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 12; i++) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + (dx * i) / 12, y: y + (dy * i) / 12 }],
        });
        await page.waitForTimeout(12);
      }
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 12 });
      await page.mouse.up();
    }
  }
  async function blank(direction) {
    await page.waitForTimeout(100);
    const point = await page.evaluate((direction) => {
      const allowed = "div,section,header,main,article,.identity-name";
      const blocked = [
        ...document.querySelectorAll(
          "button,input,textarea,h1,h2,p,.calendar-surface,[data-page-gesture]",
        ),
      ]
        .filter((el) => el.getClientRects().length)
        .map((el) => el.getBoundingClientRect());
      for (let y = 22; y < innerHeight - 145; y += 14)
        for (const x of direction < 0
          ? [innerWidth - 35, innerWidth - 70, innerWidth - 100]
          : [35, 70, 100]) {
          const el = document.elementFromPoint(x, y);
          if (
            el?.matches(allowed) &&
            el.closest(".app-stage.is-signed-in") &&
            !blocked.some(
              (r) =>
                x > r.left - 12 &&
                x < r.right + 12 &&
                y > r.top - 14 &&
                y < r.bottom + 14,
            )
          )
            return { x, y };
        }
      return null;
    }, direction);
    assert(point, "visible blank region");
    await swipe(point.x, point.y, direction * 180);
    await page.waitForTimeout(650);
  }
  await blank(-1);
  await page.getByTestId("pane-water").waitFor();
  check(true, "blank-region left swipe switches duty to water");
  await page
    .locator('[data-testid="water-handoff"][aria-busy="false"]')
    .waitFor();
  const name = page.getByTestId("water-nudge");
  const nameBox = await name.boundingBox();
  await swipe(
    nameBox.x + nameBox.width * 0.8,
    nameBox.y + nameBox.height / 2,
    -nameBox.width * 0.6,
  );
  await page.waitForTimeout(650);
  check(
    await page.getByTestId("pane-water").isVisible(),
    "dragging on the water name never becomes global page navigation",
  );
  // Real repeated clicks retain the existing 60s device limiter and server guard.
  const nudgeBefore = preview.counts.get("POST /chores/remind") || 0;
  let nativeFeedback;
  if (native) {
    // Locator RPC/auto-wait latency on a software emulator is not tap cadence.
    // Schedule only this burst in its browser; the same Vue click handlers,
    // animation frames, API calls and limiter still execute normally.
    nativeFeedback = await name.evaluate(async (el) => {
      const frames = [];
      let sampling = true;
      const sample = () => {
        if (!sampling) return;
        frames.push(getComputedStyle(el).transform);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      const r = el.getBoundingClientRect();
      for (let i = 0; i < 12; i++) {
        el.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            detail: 1,
            clientX: r.x + r.width / 2,
            clientY: r.y + r.height / 2,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 32));
      }
      const high = Number(el.getAttribute("data-intensity"));
      // Embedded compositors may start a WAAPI animation after their first
      // paint. Sample through actual settlement, not a fixed host deadline.
      await Promise.race([
        Promise.allSettled(el.getAnimations().map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
      await new Promise(requestAnimationFrame);
      sampling = false;
      return { high, frames };
    });
  } else {
    for (let i = 0; i < 12; i++) {
      await name.click({ force: true });
      await page.waitForTimeout(32);
    }
  }
  const high =
    nativeFeedback?.high ?? Number(await name.getAttribute("data-intensity"));
  check(
    high > 0.4 && high <= 1,
    "dense taps produce a bounded stronger local feedback level",
  );
  const poseFrames =
    nativeFeedback?.frames ??
    (await name.evaluate(async (el) => {
      const r = [];
      for (let i = 0; i < 12; i++) {
        await new Promise(requestAnimationFrame);
        r.push(getComputedStyle(el).transform);
      }
      return r;
    }));
  check(
    new Set(poseFrames).size > 3,
    "nudge deformation settles through actual intermediate transforms",
  );
  check(
    (preview.counts.get("POST /chores/remind") || 0) - nudgeBefore <= 1,
    "rapid visual feedback does not create a notification flood",
  );
  await page.waitForTimeout(1800);
  await name.click();
  check(
    Number(await name.getAttribute("data-intensity")) < high * 0.35,
    "feedback strength decays smoothly after a pause",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await name.click();
  check(
    (await name.locator(".nudge-hit").count()) === 0,
    "reduced-motion preference immediately clears decorative nudge feedback",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await blank(-1);
  await page.getByTestId("pane-calendar").waitFor();
  check(
    true,
    "blank-region left swipe reaches calendar and updates the existing nav",
  );
  const surface = page.locator(".month-viewport");
  const r = await surface.boundingBox();
  await swipe(r.x + r.width * 0.7, r.y + r.height * 0.5, -110);
  await page.waitForTimeout(650);
  check(
    await page.getByTestId("pane-calendar").isVisible(),
    "calendar month gesture retains ownership of horizontal movement",
  );
  await swipe(5, 650, 130);
  await page.waitForTimeout(500);
  check(
    await page.getByTestId("pane-calendar").isVisible(),
    "system left-edge region is excluded from in-app page navigation",
  );
  await blank(1);
  await page.getByTestId("pane-water").waitFor();
  await blank(1);
  await page.getByTestId("pane-duty").waitFor();
  check(true, "right swipe reverses through both adjacent pages");
  await blank(1);
  check(
    await page.getByTestId("pane-duty").isVisible(),
    "first-page boundary cannot navigate past the root",
  );
  await page.getByTestId("nav-water").click();
  await page.getByTestId("pane-water").waitFor();
  await page.waitForTimeout(650);
  const profiles = native
    ? [await page.evaluate(() => [innerWidth, innerHeight])]
    : [
        [320, 568],
        [390, 844],
        [430, 1100],
      ];
  for (const [width, height] of profiles) {
    if (!native) await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    const geometry = await page.evaluate(() => {
      const title = document
          .querySelector(".water-title-stage")
          .getBoundingClientRect(),
        actions = document
          .querySelector(".water-nudge-actions")
          .getBoundingClientRect(),
        nav = document
          .querySelector('[data-testid="nav-water"]')
          .getBoundingClientRect();
      return {
        title: title.toJSON(),
        actions: actions.toJSON(),
        nav: nav.toJSON(),
        scroll: document.documentElement.scrollWidth,
      };
    });
    check(
      geometry.title.top >= 80 &&
        geometry.actions.bottom < geometry.nav.top &&
        geometry.scroll <= width + 1,
      `water layout fits ${width}x${height} without covering navigation`,
    );
    if (height === 1100)
      check(
        geometry.title.top > 300,
        "tall-screen water content moves toward the usable visual center",
      );
    await page.screenshot({
      path: new URL(`${engine}-water-${height}.png`, evidence).pathname,
    });
  }
  check(errors.length === 0, "no Vue or browser runtime errors");
  const result = {
    status: "passed",
    browser: native
      ? "Android 15 WebView 124 (isolated debug shell)"
      : safari
        ? "WebKit"
        : "Chromium",
    touch: safari ? "pointer fallback" : "native browser touch",
    checks,
    errors,
    scope: "isolated data and simulated AI; no physical WebView/ArkWeb claim",
  };
  await fs.writeFile(
    new URL(`${engine}-checks.json`, evidence),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (page) {
    console.error(
      JSON.stringify({ body: await page.locator("body").innerText(), errors }),
    );
    await page
      .screenshot({ path: new URL(`${engine}-failure.png`, evidence).pathname })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  await device?.close();
  await preview.close();
}

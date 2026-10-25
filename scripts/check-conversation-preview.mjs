import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { _android } from "../frontend/node_modules/playwright/index.mjs";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
import utilsBundle from "../frontend/node_modules/playwright-core/lib/utilsBundle.js";
const { PNG } = utilsBundle;
const safari = process.env.DORM_BROWSER === "webkit",
  native = process.env.DORM_ANDROID_WEBVIEW === "1",
  checks = [],
  limitations = [],
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
  const edgeGlass = await page.evaluate(() => {
    const top = document.querySelector(".chat-top-frost i");
    const bottom = document.querySelector(
      '[data-testid="chat-bottom-frost"] i',
    );
    const footer = document.querySelector(".chat-footer");
    const read = (el, pseudo) => {
      const s = getComputedStyle(el, pseudo);
      return {
        blur: s.backdropFilter || s.webkitBackdropFilter,
        pointer: s.pointerEvents,
      };
    };
    return {
      top: read(top),
      bottom: read(bottom),
      footer: read(footer, "::before"),
    };
  });
  check(
    edgeGlass.top.blur.includes("6px") &&
      edgeGlass.bottom.blur.includes("blur") &&
      edgeGlass.bottom.pointer === "none" &&
      edgeGlass.footer.blur.includes("6px"),
    "top progressive glass and bottom lighter base both keep non-interactive optical layers",
  );
  if (!native && !safari) {
    const protocol = await page.context().newCDPSession(page);
    try {
      await protocol.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
      });
      check(
        await page.evaluate(() => {
          const layers = getComputedStyle(
            document.querySelector(".chat-footer-glass"),
          );
          const input = getComputedStyle(
            document.querySelector(".composer-text"),
          );
          const base = getComputedStyle(
            document.querySelector(".chat-footer"),
            "::before",
          );
          return (
            matchMedia("(prefers-reduced-transparency: reduce)").matches &&
            layers.display === "none" &&
            input.backdropFilter === "none" &&
            base.backdropFilter === "none"
          );
        }),
        "reduced transparency disables every added optical layer while keeping the input available",
      );
    } finally {
      await protocol.send("Emulation.setEmulatedMedia", { features: [] });
      await protocol.detach();
    }
  }
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
  const frostScroll = await page
    .locator(".chat-history")
    .evaluate(async (el) => {
      const initial = el.scrollTop;
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
      const bottom = document.querySelector(
        '[data-testid="chat-bottom-frost"]',
      );
      const atTop = getComputedStyle(
        bottom.querySelector(".glass-bottom-edge"),
      ).backdropFilter;
      const overflow = el.scrollHeight - el.clientHeight;
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event("scroll"));
      const atBottom = getComputedStyle(
        bottom.querySelector(".glass-bottom-edge"),
      ).backdropFilter;
      el.scrollTop = initial;
      el.dispatchEvent(new Event("scroll"));
      return { overflow, atTop, atBottom };
    });
  check(
    frostScroll.overflow > 36 &&
      frostScroll.atTop.includes("26px") &&
      frostScroll.atBottom === frostScroll.atTop,
    "edge weighted glass remains continuous while history scrolls to either boundary",
  );
  if (!native) {
    const zones = await page.evaluate(() => {
      const root = document.querySelector(".companion-chat");
      const fixture = document.createElement("div");
      fixture.id = "glass-optical-fixture";
      fixture.style.cssText =
        "position:absolute;inset:0;z-index:1;pointer-events:none;background:repeating-linear-gradient(90deg,#000 0 32px,#fff 32px 64px)";
      root.querySelector(".chat-history-frame").appendChild(fixture);
      const style = document.createElement("style");
      style.id = "glass-optical-style";
      style.textContent =
        ".chat-footer textarea,.chat-footer .composer-send,.chat-note-shortcut,.chat-ball,.chat-nameplate,.chat-toolbar{visibility:hidden!important}";
      document.head.appendChild(style);
      const composer = root
        .querySelector(".composer-text")
        .getBoundingClientRect();
      const top = root.querySelector(".glass-top-edge").getBoundingClientRect();
      return {
        core: composer.top + composer.height / 2,
        top: top.top + top.height * 0.6,
        bottom: root.getBoundingClientRect().bottom - 6,
        headerEdge: root.getBoundingClientRect().top + 6,
        headerInner: root.getBoundingClientRect().top + 150,
        clearMiddle: root.getBoundingClientRect().top + 260,
      };
    });
    const optical = PNG.sync.read(await page.screenshot());
    const contrast = (y) => {
      const values = [];
      for (let x = 64; x < 320; x++) {
        const i = (Math.round(y) * optical.width + x) * 4;
        values.push(
          (optical.data[i] + optical.data[i + 1] + optical.data[i + 2]) / 3,
        );
      }
      const average = values.reduce((a, v) => a + v, 0) / values.length;
      return Math.sqrt(
        values.reduce((a, v) => a + (v - average) ** 2, 0) / values.length,
      );
    };
    const profile = Object.fromEntries(
      Object.entries(zones).map(([key, y]) => [key, contrast(y)]),
    );
    await fs.writeFile(
      new URL(`${engine}-blur-profile.json`, evidence),
      JSON.stringify(
        {
          fixture: "temporary 64px black/white stripes behind actual glass",
          zones,
          contrast: profile,
        },
        null,
        2,
      ),
    );
    await page.screenshot({
      path: new URL(`${engine}-blur-optical-fixture.png`, evidence).pathname,
    });
    await page.evaluate(() => {
      document.getElementById("glass-optical-fixture").remove();
      document.getElementById("glass-optical-style").remove();
    });
    let opticalAvailable = true;
    if (safari) {
      // Calibrate this runner independently: some WebKit screenshot builds
      // omit backdrop filtering even for a plain, non-animated HTML control.
      // Only that reproducible runner limitation can qualify the optical test;
      // an application-only failure must still fail the suite.
      const calibrationContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const calibration = await calibrationContext.newPage();
      try {
        await calibration.setContent(
          "<style>body{margin:0;background:repeating-linear-gradient(90deg,#000 0 32px,#fff 32px 64px)}div{position:absolute;inset:0;background:#ffffff10;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}</style><div></div>",
        );
        await calibration.waitForTimeout(160);
        const image = PNG.sync.read(await calibration.screenshot());
        const values = [];
        for (let x = 64; x < 320; x++)
          values.push(image.data[(600 * image.width + x) * 4]);
        const mean = values.reduce((a, v) => a + v, 0) / values.length;
        const controlContrast = Math.sqrt(
          values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length,
        );
        opticalAvailable = controlContrast < 40;
        await fs.writeFile(
          new URL(`${engine}-blur-calibration.json`, evidence),
          JSON.stringify(
            {
              control:
                "plain HTML, no masks, no app, no animations; 24px backdrop blur",
              controlContrast,
              opticalAvailable,
            },
            null,
            2,
          ),
        );
      } finally {
        await calibrationContext.close();
      }
    }
    if (opticalAvailable) {
      check(
        profile.headerEdge < profile.headerInner &&
          profile.headerInner < profile.clearMiddle,
        "rendered top glass progressively softens actual underlay toward the screen edge, without a solid header slab",
      );
      check(
        profile.core > 2 &&
          profile.core > profile.top * 1.12 &&
          profile.core > profile.bottom * 1.2,
        "rendered optical fixture has clearer input core and progressively softer upper and screen-bottom edges",
      );
    } else {
      const limitation =
        "WebKit screenshot runner does not render backdrop blur even in an independent minimal HTML control; optical result is unverified, not passed";
      limitations.push(limitation);
      console.log("LIMIT " + limitation);
    }
  }
  const glassLayers = await page
    .locator(".chat-history")
    .evaluate((history) => {
      const footer = document.querySelector(".chat-footer");
      const panel = document.querySelector(".composer-text");
      const alpha = (s) => {
        const c =
          s.match(/\/\s*([\d.]+)\s*\)/) ||
          s.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
        return c ? Number(c[1]) : 1;
      };
      history.scrollTop = Math.max(
        0,
        history.scrollHeight - history.clientHeight - 110,
      );
      history.dispatchEvent(new Event("scroll"));
      const rect = footer.getBoundingClientRect();
      const underlay = [
        ...history.querySelectorAll(
          '.chat-bubble, [data-testid="conversation-note"]',
        ),
      ].some((el) => {
        const b = el.getBoundingClientRect();
        return b.bottom > rect.top && b.top < rect.bottom;
      });
      const css = getComputedStyle(panel),
        back = getComputedStyle(footer, "::before");
      const inputRect = panel.getBoundingClientRect();
      const editor = document.querySelector(".composer-text textarea");
      const centerTarget = document.elementFromPoint(
        inputRect.left + 40,
        inputRect.top + inputRect.height / 2,
      );
      history.scrollTop = history.scrollHeight;
      history.dispatchEvent(new Event("scroll"));
      const confirm = document
        .querySelector('[data-testid="note-confirm"]')
        .getBoundingClientRect();
      const confirmButton = document.querySelector(
        '[data-testid="note-confirm"]',
      );
      const confirmTarget = document.elementFromPoint(
        confirm.left + confirm.width / 2,
        confirm.top + confirm.height / 2,
      );
      return {
        underlay,
        panelAlpha: alpha(css.backgroundColor),
        backAlpha: alpha(back.backgroundColor),
        blur: css.backdropFilter || css.webkitBackdropFilter,
        inputReceives: centerTarget === editor,
        confirmationReachable:
          confirm.top >= rect.top &&
          confirm.bottom <= rect.bottom &&
          confirm.top >= 0 &&
          confirm.bottom <= window.innerHeight &&
          confirmButton.contains(confirmTarget),
        edgeBottom: history.getBoundingClientRect().bottom,
      };
    });
  check(
    glassLayers.underlay &&
      glassLayers.panelAlpha >= 0.2 &&
      glassLayers.panelAlpha <= 0.6 &&
      glassLayers.backAlpha < 0.5 &&
      glassLayers.blur.includes("blur") &&
      glassLayers.inputReceives &&
      glassLayers.confirmationReachable,
    "real messages scroll behind translucent input glass while final confirmation remains reachable inside the shared composer dock",
  );
  await page.screenshot({
    path: new URL(`${engine}-glass-latest.png`, evidence).pathname,
  });
  await page.locator(".chat-history").evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 110);
    el.dispatchEvent(new Event("scroll"));
  });
  await page.screenshot({
    path: new URL(`${engine}-glass-underlay.png`, evidence).pathname,
  });
  await page.locator(".chat-history").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
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
  const ringFrames = await name.evaluate(async (el) => {
    const samples = [];
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          detail: 1,
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
        }),
      );
      await new Promise(requestAnimationFrame);
      const ring = el.querySelector(".nudge-hit:last-child .nudge-ring");
      const animation = ring.getAnimations()[0];
      animation.pause();
      animation.currentTime = 180;
      await new Promise(requestAnimationFrame);
      samples.push({
        spread: Number(
          getComputedStyle(ring).getPropertyValue("--nudge-spread"),
        ),
        transform: getComputedStyle(ring).transform,
      });
      await new Promise((resolve) => setTimeout(resolve, 32));
    }
    return samples;
  });
  check(
    ringFrames.every(
      (f, i) => i === 0 || f.spread > ringFrames[i - 1].spread,
    ) &&
      ringFrames.at(-1).spread > ringFrames[0].spread * 1.8 &&
      new Set(ringFrames.map((f) => f.transform)).size > 3,
    "successive rapid taps visibly grow actual ripple intermediate transforms from small to large",
  );
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
    status: limitations.length ? "passed-with-limitations" : "passed",
    browser: native
      ? "Android 15 WebView 124 (isolated debug shell)"
      : safari
        ? "WebKit"
        : "Chromium",
    touch: safari ? "pointer fallback" : "native browser touch",
    checks,
    errors,
    limitations,
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

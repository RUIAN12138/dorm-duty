// Isolated browser geometry checks. Synthetic VisualViewport events are not
// physical iPhone IME acceptance and must be reported separately.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const output = new URL("../data/compact-chat/", import.meta.url);
await fs.mkdir(output, { recursive: true });
const h = await createConversationPreview();
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "chromium" && process.platform === "darwin"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {}),
});
const checks = [],
  errors = [],
  metrics = { engine };
const check = (ok, label) => {
  assert(ok, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
let page, context;
const near = (a, b, t = 1.5) => Math.abs(a - b) <= t;
async function read() {
  return page.evaluate(() => {
    const root = document.querySelector(".companion-chat"),
      vv = visualViewport;
    const box = (s) => {
      const el = root.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect(),
        c = getComputedStyle(el);
      return {
        top: r.top - vv.offsetTop,
        bottom: r.bottom - vv.offsetTop,
        height: r.height,
        width: r.width,
        opacity: +c.opacity,
        display: c.display,
      };
    };
    const sc = root.querySelector(".chat-history"),
      back = root.querySelector(".chat-toolbar button");
    const promptBox = box(".chat-quick-prompts");
    return {
      root: box(":scope"),
      height: root.getBoundingClientRect().height,
      top: root.getBoundingClientRect().top,
      ball: box(".chat-ball-visual"),
      name: box(".chat-nameplate"),
      back: box(".chat-toolbar button"),
      backDisabled:
        back.disabled || back.tabIndex < 0 || !!back.closest("[inert]"),
      footer: box(".chat-footer"),
      composer: box(".chat-composer"),
      note: box(".conversation-note"),
      noteInFooter: !!root.querySelector(".chat-footer .conversation-note"),
      promptBox,
      prompts: [...root.querySelectorAll(".chat-quick-prompts button")].map(
        (e) => e.textContent.trim(),
      ),
      historyPadding: +parseFloat(getComputedStyle(sc).paddingTop),
      gap: sc.scrollHeight - sc.scrollTop - sc.clientHeight,
      scroll: sc.scrollTop,
      windowY: scrollY,
      font: getComputedStyle(root.querySelector(".chat-bubble")).fontSize,
      phase: root.dataset.phase,
    };
  });
}
async function stage(height, top = 0) {
  await page.evaluate(({ height, top }) => window.compactStage(height, top), {
    height,
    top,
  });
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
async function traceStart() {
  await page.evaluate(() => {
    window.compactFrames = [];
    window.compactRecording = true;
    const run = () => {
      if (!window.compactRecording) return;
      const root = document.querySelector(".companion-chat"),
        f = root?.querySelector(".chat-footer"),
        c = root?.querySelector(".chat-composer"),
        n = root?.querySelector(".conversation-note");
      if (f && c)
        window.compactFrames.push({
          t: performance.now(),
          footer: f.getBoundingClientRect().top,
          fh: f.getBoundingClientRect().height,
          composer: c.getBoundingClientRect().bottom,
          note: n?.getBoundingClientRect().height || 0,
          y: scrollY,
        });
      requestAnimationFrame(run);
    };
    run();
  });
}
async function traceEnd(label) {
  const frames = await page.evaluate(() => {
    window.compactRecording = false;
    return window.compactFrames;
  });
  metrics[label] = frames;
  return frames;
}
async function send(text) {
  await page.getByLabel("和球球说句话", { exact: true }).fill(text);
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
}
try {
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const history = Array.from({ length: 80 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    messages: ["隔离历史第" + i + "条，检查连续键盘布局和消息锚点。"],
    emotion: "02",
    request_id: "compact-" + i,
  }));
  let stateCalls = 0,
    chatCalls = 0;
  await page.route("**/chores/companion/state?*", (route) => {
    stateCalls++;
    return route.fulfill({
      json: { available: true, messages: history, reminders: [] },
    });
  });
  await page.route("**/chores/companion/chat", (route) => {
    chatCalls++;
    return route.fulfill({
      json: { messages: ["这是隔离回复。"], emotion: "10", reminder: null },
    });
  });
  await page.goto(h.url + "/?start=1");
  const ball = page.locator(".companion-identity .dorm-companion");
  await ball.waitFor();
  await page.waitForTimeout(450);
  await ball.click();
  await page.locator('.companion-chat[data-phase="open"]').waitFor();
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const v = visualViewport;
    window.compactStage = (height, top) => {
      Object.defineProperty(v, "height", {
        configurable: true,
        get: () => height,
      });
      Object.defineProperty(v, "offsetTop", {
        configurable: true,
        get: () => top,
      });
      v.dispatchEvent(new Event("resize"));
      v.dispatchEvent(new Event("scroll"));
    };
  });
  const initial = await read();
  metrics.initial = initial;
  await page.screenshot({
    path: new URL(engine + "-entry.png", output).pathname,
  });
  check(
    initial.prompts.join("|") ===
      "我要留言|今天做什么？|怎么改轮序？|帮我设提醒",
    "every entry exposes note first and preserves existing prompt order with cached history",
  );
  check(initial.gap < 2, "cached history opens directly at latest message");
  check(
    near(initial.ball.width, 88),
    "normal header retains original ball size",
  );
  check(initial.windowY === 0, "chat entry does not pan the document");
  const editor = page.getByLabel("和球球说句话", { exact: true });
  await page.locator(".composer-text").click();
  await editor.focus();
  const stages = [];
  for (const height of [
    836, 820, 804, 780, 750, 720, 690, 660, 630, 600, 550, 500, 450, 420,
  ]) {
    await stage(height);
    stages.push({ ...(await read()), vh: height });
  }
  metrics.keyboardStages = stages;
  check(
    stages.every((s) => near(s.height, s.vh) && near(s.top, 0)),
    "one root continuously follows every visual viewport sample",
  );
  check(
    stages.every((s) =>
      near(
        s.vh - s.composer.bottom,
        Math.max(10, 58 - (844 - s.vh <= 8 ? 0 : 844 - s.vh)),
      ),
    ),
    "composer follows viewport continuously without extra safe-area compensation",
  );
  check(
    stages.every(
      (s, i) => !i || s.ball.width <= stages[i - 1].ball.width + 0.75,
    ),
    "header compression is monotonic during keyboard rise",
  );
  check(
    stages.some((s) => s.ball.width > 65 && s.ball.width < 84),
    "header has visible intermediate scale rather than a boolean size jump",
  );
  const compact = stages.at(-1);
  check(
    compact.ball.width / initial.ball.width >= 0.65 &&
      compact.ball.width / initial.ball.width <= 0.75,
    "fully expanded keyboard scales ball to 65–75 percent",
  );
  check(
    compact.historyPadding < initial.historyPadding - 45,
    "header releases meaningful vertical space to messages",
  );
  check(
    compact.back.opacity < 0.05 && compact.backDisabled,
    "keyboard hides back control visually and from focus",
  );
  check(
    compact.font === initial.font,
    "message font is unchanged in compact mode",
  );
  const shrink = initial.ball.top - compact.ball.top;
  check(shrink > 10, "ball moves upward with compact header");
  check(
    !compact.promptBox ||
      compact.promptBox.height < 1 ||
      compact.promptBox.opacity < 0.05,
    "quick prompts collapse when keyboard occupies space",
  );
  await stage(390, 18);
  const offset = await read();
  check(
    near(offset.top, 18) && near(390 - offset.composer.bottom, 10),
    "viewport panning and keyboard composer share the same origin",
  );
  // User is reading history: preserve the visible bubble rather than repinning.
  await stage(844);
  await editor.evaluate((e) => e.blur());
  await page.waitForTimeout(350);
  const restored = await read();
  check(
    near(restored.ball.width, 88) && restored.back.opacity > 0.95,
    "keyboard recovery restores normal header and back",
  );
  check(
    restored.prompts.length === 4 && restored.promptBox.height > 20,
    "per-entry suggestions recover after keyboard without note workflow",
  );
  const scroller = page.getByTestId("chat-history");
  await scroller.evaluate((el) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -150 }));
    el.scrollTop = 500;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(80);
  const anchor = await scroller.evaluate((el) => {
    const n = [...el.querySelectorAll(".chat-bubble")].find(
      (e) => e.getBoundingClientRect().top > 220,
    );
    window.compactAnchor = n;
    return n.getBoundingClientRect().top;
  });
  await editor.focus();
  await stage(500);
  const during = await page.evaluate(
    () => window.compactAnchor.getBoundingClientRect().top,
  );
  await stage(844);
  await editor.evaluate((e) => e.blur());
  const after = await page.evaluate(
    () => window.compactAnchor.getBoundingClientRect().top,
  );
  metrics.anchor = { anchor, during, after };
  check(
    near(during, anchor, 5) && near(after, anchor, 5),
    "keyboard open/recovery preserve a reader history anchor",
  );
  // Keep reader paused while the dock changes; no forced history scroll.
  await traceStart();
  await page.getByRole("button", { name: "我要留言", exact: true }).click();
  await page.getByTestId("conversation-note").waitFor();
  await page.waitForTimeout(420);
  const note = await read();
  metrics.note = note;
  const openFrames = await traceEnd("noteOpen");
  check(note.noteInFooter, "note workflow and input share one dock container");
  check(
    note.note.bottom <= note.composer.top + 1,
    "note controls remain above composer",
  );
  check(
    openFrames.some(
      (f) => f.fh > initial.footer.height + 8 && f.fh < note.footer.height - 8,
    ),
    "note opening contains intermediate layout frames",
  );
  check(
    openFrames.every((f) => near(f.y, 0)),
    "note opening never pans entire document",
  );
  check(
    chatCalls === 0,
    "note quick action starts state machine without AI request",
  );
  await page.getByRole("button", { name: "张三", exact: true }).click();
  await send("隔离留言内容，不会通知真实成员。");
  await page.getByTestId("note-confirm").waitFor();
  await page.waitForTimeout(350);
  const confirm = await read();
  check(
    confirm.noteInFooter && confirm.note.bottom <= confirm.composer.top + 1,
    "confirmation remains in same dock above the composer",
  );
  await page.getByRole("button", { name: "修改内容", exact: true }).click();
  await editor.focus();
  await stage(390);
  await page.waitForTimeout(280);
  const combined = await read();
  metrics.noteKeyboard = combined;
  await page.screenshot({
    path: new URL(engine + "-compact-note.png", output).pathname,
    clip: { x: 0, y: 0, width: 390, height: 390 },
  });
  check(
    near(390 - combined.composer.bottom, 10),
    "note editing and keyboard retain attached input",
  );
  check(
    combined.note.top >= combined.ball.bottom + 5,
    "note panel never overlaps compact ball",
  );
  check(
    combined.note.height < 220,
    "note panel is bounded when keyboard takes space",
  );
  await traceStart();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.waitForTimeout(420);
  const closeFrames = await traceEnd("noteClose");
  check(
    closeFrames.some((f) => f.note > 0 && f.fh > 70) &&
      closeFrames.at(-1).note === 0,
    "note cancel has reverse intermediate frames before release",
  );
  check(
    closeFrames.every((f) => near(f.y, 0)),
    "note cancellation keeps document stable",
  );
  await stage(844);
  await editor.evaluate((e) => e.blur());
  await page.waitForTimeout(320);
  // Fast reversal checks controller state, not only final class.
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "我要留言", exact: true }).click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
  }
  await page.waitForTimeout(400);
  check(
    (await page.getByTestId("conversation-note").count()) === 0,
    "rapid note open/cancel settles without ghost panel",
  );
  // Verify the relocated panel still uses the existing delivery gate, including
  // retries and synchronous duplicate confirmations, only in this memory dorm.
  await send("我要给张三留言：隔离发送回归");
  await page.getByTestId("note-confirm").waitFor();
  await page.route(
    "**/chores/notes",
    (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: "隔离网络失败" } },
      }),
    { times: 1 },
  );
  await page.getByTestId("note-confirm").click();
  await page
    .locator('[data-testid="conversation-note"][data-phase="failed"]')
    .waitFor();
  check(
    (await page.getByTestId("conversation-note").innerText()).includes(
      "隔离发送回归",
    ),
    "failed note transport preserves confirmation content in dock",
  );
  check(
    (h.counts.get("POST /chores/notes") || 0) === 0,
    "failed transport is never silently retried",
  );
  await page.route(
    "**/chores/notes",
    async (route) => {
      await new Promise((r) => setTimeout(r, 150));
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByTestId("note-confirm").evaluate((el) => {
    for (let i = 0; i < 6; i++) el.click();
  });
  await page.getByText("留言已发出。", { exact: true }).waitFor();
  check(
    h.counts.get("POST /chores/notes") === 1,
    "six confirmation activations deliver exactly one existing API request",
  );
  check(
    (await h.board(h.people[1])).reminders.some(
      (n) => n.body === "隔离发送回归" && n.sender_id === h.people[0].user_id,
    ),
    "existing API preserves real sender and recipient in isolated dorm",
  );
  await page.getByTestId("conversation-note").waitFor({ state: "hidden" });
  await editor.fill("保留的未发草稿");
  await page.keyboard.press("Escape");
  await page.locator(".companion-chat").waitFor({ state: "hidden" });
  await page.waitForTimeout(250);
  await ball.click();
  await page.locator('.companion-chat[data-phase="open"]').waitFor();
  await page.waitForTimeout(350);
  const reopen = await read();
  check(
    reopen.prompts[0] === "我要留言" && reopen.promptBox.height > 20,
    "reentry always reopens shortcut suggestions",
  );
  check(
    (await editor.inputValue()) === "保留的未发草稿",
    "note and keyboard transitions preserve unsent draft",
  );
  check(reopen.gap < 2, "reentry positions latest history instantly");
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await page.screenshot({
      path: new URL(engine + "-" + theme + ".png", output).pathname,
    });
    const s = await read();
    check(
      s.composer.width > 300 && s.prompts.length === 4,
      theme + " theme keeps dock and shortcuts usable",
    );
  }
  await page.getByRole("button", { name: "我要留言", exact: true }).click();
  await page.getByTestId("conversation-note").waitFor();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  check(
    (await page.getByTestId("conversation-note").count()) === 0,
    "switching reduced motion mid-exit releases the note snapshot without a timer",
  );
  await editor.focus();
  await stage(420);
  const reduced = await read();
  check(
    reduced.ball.width / 88 >= 0.65 && reduced.ball.width / 88 <= 0.75,
    "reduced motion reaches compact state without disabling function",
  );
  check(errors.length === 0, "no browser runtime errors");
  metrics.stateCalls = stateCalls;
  metrics.chatCalls = chatCalls;
  metrics.checks = checks.length;
  await fs.writeFile(
    new URL(engine + "-result.json", output),
    JSON.stringify(metrics, null, 2),
  );
  console.log(checks.length + " compact chat checks passed");
} catch (error) {
  if (page)
    await page
      .screenshot({ path: new URL(engine + "-failure.png", output).pathname })
      .catch(() => {});
  await fs.writeFile(
    new URL(engine + "-failure.json", output),
    JSON.stringify(
      {
        error: String(error),
        checks,
        errors,
        metrics,
        state: page ? await read().catch(() => null) : null,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await h.close();
}

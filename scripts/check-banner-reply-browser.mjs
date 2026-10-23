// Actual Vue banner + in-memory SQLite and existing HTTP APIs. Viewport samples
// simulate IME geometry; they do not prove a physical keyboard was shown.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const out = new URL("../data/banner-reply/", import.meta.url);
await fs.mkdir(out, { recursive: true });
const h = await createConversationPreview();
const b = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "chromium" && process.platform === "darwin"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {}),
});
const context = await b.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage(),
  checks = [],
  errors = [],
  metrics = { engine };
page.setDefaultTimeout(12000);
page.on("pageerror", (e) => errors.push(e.message));
const check = (v, label) => {
  assert(v, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
let sequence = 0;
const card = () => page.locator(".reminder-banner-card");
const editor = () =>
  page.locator('.reminder-banner-motion[role="dialog"] textarea');
const sendButton = () =>
  page.locator('.reminder-banner-card form button[type="submit"]');
async function incoming(
  label,
  { sender = 1, system = false, broadcast = false } = {},
) {
  // Stop the preceding fixture before seeding: its live poll must not consume
  // the next test banner and persist its presentation receipt before reload.
  await page.goto("about:blank");
  h.h.db.sqlite
    .prepare(
      "UPDATE chore_reminders SET read_at=COALESCE(read_at,?) WHERE target_member_id=?",
    )
    .run(new Date().toISOString(), h.people[0].user_id);
  h.h.db.sqlite.exec(
    "UPDATE chore_reminders SET created_at='2000-01-01T00:00:00Z'",
  );
  const text = label + " " + ++sequence;
  const r = await h.h.request("/chores/notes", {
    method: "POST",
    token: h.people[sender].token,
    data: { target_member_id: broadcast ? "all" : h.people[0].user_id, text },
  });
  assert(r.ok, JSON.stringify(await r.json()));
  const note = (await h.board()).reminders.find((n) => n.body === text);
  assert(note);
  if (system)
    h.h.db.sqlite
      .prepare("UPDATE chore_reminders SET source='scheduled' WHERE id=?")
      .run(note.id);
  await page.goto(h.url + "/?start=1&banner-case=" + sequence);
  await page.getByTestId("reminder-banner").filter({ hasText: text }).waitFor();
  await page.waitForTimeout(450);
  return { ...note, text };
}
const boardNote = async (id) =>
  (await h.board()).reminders.find((n) => n.id === id);
async function waitRead(id) {
  const until = Date.now() + 12000;
  while (Date.now() < until) {
    if ((await boardNote(id))?.read_at) return;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw Error("server read timeout " + id);
}
async function recordStart() {
  await page.evaluate(() => {
    window.bannerFrames = [];
    window.bannerRecording = true;
    const run = () => {
      if (!window.bannerRecording) return;
      const el = document.querySelector(".reminder-banner-card");
      if (el) {
        const r = el.getBoundingClientRect(),
          input = el.querySelector("textarea"),
          v = input?.getBoundingClientRect();
        window.bannerFrames.push({
          t: performance.now(),
          top: r.top,
          bottom: r.bottom,
          height: r.height,
          width: r.width,
          opacity: +getComputedStyle(el).opacity,
          focused: document.activeElement === input,
          inputHeight: v?.height || 0,
          y: scrollY,
        });
      }
      requestAnimationFrame(run);
    };
    run();
  });
}
async function recordEnd(label) {
  const frames = await page.evaluate(() => {
    window.bannerRecording = false;
    return window.bannerFrames;
  });
  metrics[label] = frames;
  return frames;
}
async function hold() {
  const r = await card().boundingBox();
  assert(r);
  await page.mouse.move(r.x + r.width / 2, r.y + 23);
  await page.mouse.down();
  await page.waitForTimeout(430);
  await page.mouse.up();
  await editor().waitFor({ state: "visible" });
  await page.waitForTimeout(320);
}
async function swipe(distance) {
  const r = await card().boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + 24);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2, Math.max(2, r.y + 24 - distance), {
    steps: 6,
  });
  await page.mouse.up();
}
async function submit(text) {
  await editor().fill(text);
  await sendButton().click();
}
try {
  const first = await incoming("直接回复");
  await page.evaluate(
    () =>
      (window.originalBanner = document.querySelector(".reminder-banner-card")),
  );
  const initial = await card().boundingBox();
  await recordStart();
  await hold();
  const frames = await recordEnd("hold");
  check(
    await card().evaluate((el) => el === window.originalBanner),
    "long press expands the same banner DOM rather than mounting a different card",
  );
  check(
    (await page.locator(".companion-chat").count()) === 0,
    "inline reply never navigates to companion chat",
  );
  check(
    await editor().evaluate((el) => document.activeElement === el),
    "long press and trusted release focus the inline editor",
  );
  check(
    frames.some(
      (f) =>
        f.height > initial.height + 4 &&
        f.height < Math.max(...frames.map((x) => x.height)) - 4,
    ),
    "banner expansion contains continuous intermediate height frames",
  );
  check(
    !(await boardNote(first.id)).read_at,
    "entering reply does not mark message read",
  );
  check(
    await editor().evaluate(
      (el) => parseFloat(getComputedStyle(el).fontSize) >= 16,
    ),
    "inline editor uses readable input size without Safari auto-zoom trigger",
  );
  const pose = await card().boundingBox();
  check(
    pose.y >= 0 && pose.x >= 0 && pose.x + pose.width <= 391,
    "expanded reply stays within narrow viewport bounds",
  );
  await page.screenshot({
    path: new URL(engine + "-reply-light.png", out).pathname,
  });
  // Only the new reply transport is intercepted. Existing sender validation and
  // read API remain real, so failure must leave both data and local draft intact.
  let attempts = 0;
  const fail = (route) => {
    attempts++;
    return route.fulfill({
      status: 503,
      json: { detail: { message: "隔离发送失败" } },
    });
  };
  await page.route("**/chores/notes", fail);
  await submit("失败时保留这段输入");
  await page.getByText("隔离发送失败", { exact: false }).waitFor();
  check(
    (await editor().inputValue()) === "失败时保留这段输入",
    "failed reply retains the complete unsent draft",
  );
  check(
    !(await boardNote(first.id)).read_at,
    "failed reply stays unread on server",
  );
  check(attempts === 1, "failed send does not auto-submit a second note");
  await page.unroute("**/chores/notes", fail);
  const sentBefore = h.counts.get("POST /chores/notes") || 0;
  await page.route(
    "**/chores/notes",
    async (route) => {
      await new Promise((r) => setTimeout(r, 160));
      await route.continue();
    },
    { times: 1 },
  );
  await sendButton().evaluate((el) => {
    for (let i = 0; i < 6; i++) el.click();
  });
  await waitRead(first.id);
  await editor().waitFor({ state: "hidden" });
  check(
    (h.counts.get("POST /chores/notes") || 0) === sentBefore + 1,
    "six synchronous send activations produce one existing notes API request",
  );
  check(
    (await h.board(h.people[1])).reminders.some(
      (n) =>
        n.body === "失败时保留这段输入" && n.sender_id === h.people[0].user_id,
    ),
    "reply uses actual sender as target and records authenticated reply author",
  );
  check(
    (await boardNote(first.id)).read_at,
    "confirmed reply success marks only its original incoming message read",
  );
  // Backdrop cancellation has different semantics from explicit upward dismissal.
  const cancel = await incoming("取消不读");
  await hold();
  await editor().fill("取消编辑不应发送");
  const backdrop = page.locator(
    '[data-testid="banner-reply-backdrop"],.banner-reply-backdrop,.reminder-reply-backdrop',
  );
  await backdrop.first().click({ position: { x: 8, y: 520 } });
  await editor().waitFor({ state: "hidden" });
  check(
    !(await boardNote(cancel.id)).read_at,
    "backdrop exit from reply keeps original message unread",
  );
  const short = await incoming("短滑不读");
  await swipe(4);
  await page.waitForTimeout(350);
  check(
    (await page.getByTestId("reminder-banner").isVisible()) &&
      !(await boardNote(short.id)).read_at,
    "short upward swipe springs back without read acknowledgement",
  );
  const manual = await incoming("上滑已读");
  await recordStart();
  await swipe(120);
  await waitRead(manual.id);
  await page.waitForTimeout(180);
  const leave = await recordEnd("manualLeave");
  check(
    (await boardNote(manual.id)).read_at,
    "explicit upward dismissal commits server read state",
  );
  check(
    leave.some((f) => f.height > 0 && f.opacity < 1),
    "manual dismissal retains fading motion frames",
  );
  const timeout = await incoming("超时不读");
  await page
    .getByTestId("reminder-banner")
    .waitFor({ state: "hidden", timeout: 9500 });
  check(
    !(await boardNote(timeout.id)).read_at,
    "automatic timeout preserves server unread status",
  );
  // Read failure after a successful reply must not turn into a failed reply or
  // silently lose the receipt; current identity retries it on network recovery.
  const pending = await incoming("回执重试");
  await hold();
  let readAttempts = 0;
  const readFailure = (route) => {
    readAttempts++;
    return route.fulfill({
      status: 503,
      json: { detail: { message: "隔离已读失败" } },
    });
  };
  await page.route("**/chores/reminders/*/read", readFailure);
  await submit("发送成功但回执暂时失败");
  await editor().waitFor({ state: "hidden" });
  await page.waitForTimeout(100);
  check(
    readAttempts >= 1 && !(await boardNote(pending.id)).read_at,
    "failed read acknowledgement is not optimistically rendered as server read",
  );
  await page.unroute("**/chores/reminders/*/read", readFailure);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
  });
  await waitRead(pending.id);
  check(
    (await boardNote(pending.id)).read_at,
    "network recovery retries captured receipt after banner has closed",
  );
  const secondRead = await h.board();
  check(
    secondRead.reminders.find((n) => n.id === pending.id).read_at,
    "another fresh board request receives confirmed read state",
  );
  // New incoming messages cannot silently replace the editor or be marked read
  // by a send that began for an older message.
  const queued = await incoming("正在回复的消息");
  await hold();
  await editor().fill("固定原始收件人");
  h.h.db.sqlite.exec(
    "UPDATE chore_reminders SET created_at='2000-01-01T00:00:00Z'",
  );
  const q = await h.h.request("/chores/notes", {
    token: h.people[2].token,
    method: "POST",
    data: {
      target_member_id: h.people[0].user_id,
      text: "稍后到达的另一条消息",
    },
  });
  assert(q.ok);
  const later = (await h.board()).reminders.find(
    (n) => n.body === "稍后到达的另一条消息",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(300);
  check(
    await card().evaluate(
      (el, id) =>
        el.closest("[data-reminder-id]").getAttribute("data-reminder-id") ===
        String(id),
      queued.id,
    ),
    "new incoming message does not replace the active reply card",
  );
  await sendButton().click();
  await waitRead(queued.id);
  check(
    !(await boardNote(later.id)).read_at,
    "completing older reply never marks newly queued message read",
  );
  const system = await incoming("系统提醒不可回复", { system: true });
  const r = await card().boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + 25);
  await page.mouse.down();
  await page.waitForTimeout(430);
  await page.mouse.up();
  await page.waitForTimeout(200);
  check(
    (await editor().count()) === 0 && !(await boardNote(system.id)).read_at,
    "system reminder never invents reply target or reads on hold",
  );
  // Continuous simulated IME stages, including candidate-bar and panning.
  const keyboard = await incoming("键盘布局");
  await hold();
  await page.evaluate(() => {
    const v = visualViewport;
    window.bannerStage = (height, top = 0) => {
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
  const geometry = [];
  for (const [height, top] of [
    [780, 0],
    [660, 0],
    [530, 0],
    [420, 18],
    [336, 0],
    [300, 0],
    [390, 0],
  ]) {
    await page.evaluate(({ height, top }) => window.bannerStage(height, top), {
      height,
      top,
    });
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    await page.waitForTimeout(80);
    const g = await card().evaluate((el) => {
      const r = el.getBoundingClientRect(),
        input = el.querySelector("textarea").getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        editorBottom: input.bottom,
        vh: visualViewport.height,
        vt: visualViewport.offsetTop,
        y: scrollY,
      };
    });
    geometry.push(g);
  }
  metrics.keyboard = geometry;
  check(
    geometry.every((g) => g.top >= g.vt - 1 && g.bottom <= g.vt + g.vh - 7),
    "reply panel follows candidate-bar and viewport offset within visible bounds",
  );
  check(
    geometry.at(-1).bottom >= geometry.at(-1).vt + geometry.at(-1).vh - 16,
    "fully attached reply ends close to keyboard top",
  );
  check(
    geometry.every((g) => g.y === geometry[0].y),
    "keyboard transitions do not pan background document",
  );
  await page.screenshot({
    path: new URL(engine + "-keyboard-simulated.png", out).pathname,
    clip: { x: 0, y: 0, width: 390, height: 390 },
  });
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    check(
      await editor().isVisible(),
      theme + " theme retains readable, reachable inline editor",
    );
    await page.screenshot({
      path: new URL(engine + "-reply-" + theme + ".png", out).pathname,
    });
  }
  await recordStart();
  await backdrop.first().click({ position: { x: 8, y: 520 } });
  await editor().waitFor({ state: "hidden" });
  await page.waitForTimeout(100);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  check(
    (await card().boundingBox()).y < 16,
    "changing motion preference mid-return immediately settles the reply position",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const collapse = await recordEnd("replyCollapse");
  check(
    collapse.some((f) => f.top > 20 && f.top < geometry.at(-1).top - 3),
    "keyboard-attached reply reverses through intermediate positions instead of snapping to parked top",
  );
  check(
    (await card().boundingBox()).y < 16,
    "collapsed reply returns to its original banner anchor",
  );
  check(
    !(await boardNote(keyboard.id)).read_at,
    "keyboard-attached backdrop cancellation preserves unread status",
  );
  await page.evaluate(() => {
    delete visualViewport.height;
    delete visualViewport.offsetTop;
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await incoming("横屏回复");
  await hold();
  const wide = await card().boundingBox();
  check(
    wide.y >= 0 && wide.y + wide.height < 390,
    "landscape reply keeps editor and actions within the visible area",
  );
  await page.keyboard.press("Escape");
  check(
    !(await boardNote(landscape.id)).read_at,
    "escape cancels landscape reply without read acknowledgement",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await incoming("减动效回复");
  await hold();
  check(
    await editor().isVisible(),
    "reduced motion preserves inline reply functionality",
  );
  await page.keyboard.press("Escape");
  check(
    !(await boardNote(reduced.id)).read_at,
    "reduced-motion cancellation preserves unread policy",
  );
  check(errors.length === 0, "no Vue or browser runtime errors");
  await fs.writeFile(
    new URL(engine + "-result.json", out),
    JSON.stringify(
      {
        engine,
        checks,
        metrics,
        errors,
        limitations: [
          "Synthetic VisualViewport, not a physical IME test",
          "No production notifications or real members; in-memory harness only",
        ],
      },
      null,
      2,
    ),
  );
  console.log(checks.length + " banner reply browser checks passed");
} catch (error) {
  await page
    .screenshot({ path: new URL(engine + "-failure.png", out).pathname })
    .catch(() => {});
  await fs.writeFile(
    new URL(engine + "-failure.json", out),
    JSON.stringify(
      {
        error: String(error),
        checks,
        metrics,
        errors,
        body: await page
          .locator("body")
          .innerText()
          .catch(() => null),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await b.close();
  await h.close();
}

// Uses real browser touch/mouse dispatch against an isolated in-memory dorm.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const out = new URL("../data/tap-arbitration/", import.meta.url);
await fs.mkdir(out, { recursive: true });
const preview = await createConversationPreview();
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "chromium" && process.platform === "darwin"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {}),
});
let activePage;
const checks = [],
  results = [],
  errors = [];
const check = (ok, label) => {
  assert(ok, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
async function fixture(deferClicks = false) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  activePage = page;
  await page.addInitScript(() => {
    window.tapTrace = [];
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click"])
      document.addEventListener(
        type,
        (e) =>
          window.tapTrace.push({
            type,
            x: e.clientX,
            y: e.clientY,
            at: performance.now(),
            target: e.target instanceof Element ? e.target.className : "",
          }),
        true,
      );
  });
  page.setDefaultTimeout(10000);
  const calls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/chores/companion/"))
      calls.push({ url: r.url(), at: Date.now() });
  });
  if (deferClicks)
    await page.addInitScript(() => {
      window.delayBallClicks = true;
      document.addEventListener(
        "click",
        (e) => {
          if (window.delayBallClicks && e.detail > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        },
        true,
      );
    });
  await page.goto(preview.url + "/?start=1");
  const ball = page.locator(".companion-identity .dorm-companion");
  await ball.waitFor();
  await page.waitForTimeout(450);
  const pos = async (l) => {
    const b = await l.boundingBox();
    assert(b);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  return {
    page,
    context,
    ball,
    calls,
    pos,
    async tap(point, kind = "touch") {
      if (kind === "touch") await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
    },
  };
}
try {
  for (const kind of ["touch", "mouse"])
    for (const target of ["home", "moving"]) {
      const f = await fixture();
      const start = await f.pos(f.ball);
      const initial = await f.ball.getAttribute("title");
      await f.tap(start, kind);
      // Leave room for real touch dispatch and the explicit 65ms moving-target
      // latency below. CI transport adds time too; an expired >280ms pair is
      // not a valid double-tap test and must not force a wider product window.
      await f.page.waitForTimeout(target === "moving" ? 25 : 85);
      const second =
        target === "moving"
          ? await f.pos(f.page.locator(".chat-ball .dorm-companion"))
          : { x: start.x + 7, y: start.y + 5 };
      // A moving visual may advance between a touch device's coordinate
      // sample and dispatch. Exercise that bounded latency, not just a still hit.
      if (target === "moving") await f.page.waitForTimeout(65);
      await f.tap(second, kind);
      const gap = await f.page.evaluate(() => {
        const firstUp = window.tapTrace.find((e) => e.type === "pointerup");
        const secondDown = window.tapTrace.filter(
          (e) => e.type === "pointerdown",
        )[1];
        return secondDown.at - firstUp.at;
      });
      check(
        gap <= 280,
        kind +
          " double at " +
          target +
          " is delivered within the real tap window",
      );
      await f.page.locator(".companion-chat").waitFor({ state: "detached" });
      await f.page.waitForTimeout(350);
      check(
        (await f.page.locator(".companion-chat").count()) === 0,
        kind + " double at " + target + " reverses chat without delayed reopen",
      );
      check(
        f.calls.length === 0,
        kind + " double at " + target + " sends no chat/history requests",
      );
      check(
        (await f.ball.getAttribute("title")) !== initial,
        kind +
          " double at " +
          target +
          " reaches original expression interaction",
      );
      results.push({
        kind,
        target,
        second,
        initial,
        after: await f.ball.getAttribute("title"),
        calls: f.calls,
      });
      await f.context.close();
    }
  // The 52px source ball spans both points below; the pair is ~50px apart, so
  // it only works when the whole original rect stays a double-tap target.
  for (const kind of ["touch", "mouse"])
    for (const edge of [
      {
        name: "lower-left to upper-right",
        first: { x: -22, y: 12 },
        second: { x: 22, y: -12 },
      },
      {
        name: "upper-right to lower-left",
        first: { x: 22, y: -12 },
        second: { x: -22, y: 12 },
      },
    ]) {
      const f = await fixture();
      const start = await f.pos(f.ball);
      const initial = await f.ball.getAttribute("title");
      await f.tap(
        { x: start.x + edge.first.x, y: start.y + edge.first.y },
        kind,
      );
      await f.page.waitForTimeout(130);
      await f.tap(
        { x: start.x + edge.second.x, y: start.y + edge.second.y },
        kind,
      );
      await f.page.locator(".companion-chat").waitFor({ state: "detached" });
      await f.page.waitForTimeout(350);
      check(
        (await f.page.locator(".companion-chat").count()) === 0,
        kind + " " + edge.name + " source-ball edges reverse chat",
      );
      check(
        f.calls.length === 0,
        kind + " " + edge.name + " source-ball edges send no chat requests",
      );
      check(
        (await f.ball.getAttribute("title")) !== initial,
        kind + " " + edge.name + " source-ball edges reach expression",
      );
      results.push({
        kind,
        target: "source-edges:" + edge.name,
        initial,
        after: await f.ball.getAttribute("title"),
        calls: f.calls,
      });
      await f.context.close();
    }
  {
    const f = await fixture();
    const p = await f.pos(f.ball);
    await f.tap(p);
    await f.page.waitForTimeout(100);
    check(
      (await f.page.locator(".companion-chat").count()) === 1,
      "single begins reversible visual expansion before arbitration ends",
    );
    check(
      f.calls.length === 0,
      "first 100ms visual preview does not read history",
    );
    await f.page.waitForFunction(
      () =>
        document
          .querySelector(".companion-chat")
          ?.getAttribute("data-phase") === "open",
    );
    await f.page.waitForTimeout(400);
    check(
      f.calls.filter((c) => c.url.includes("/state")).length === 1,
      "confirmed single loads history exactly once",
    );
    await f.context.close();
  }
  {
    const f = await fixture();
    const p = await f.pos(f.ball);
    await f.page.mouse.move(p.x, p.y);
    await f.page.mouse.down();
    await f.page.waitForTimeout(420);
    await f.page.mouse.up();
    await f.page.waitForTimeout(700);
    check(
      (await f.page.locator(".companion-chat").count()) === 1,
      "long press survives pointer release without accidental close",
    );
    check(
      f.calls.filter((c) => c.url.includes("/state")).length === 1,
      "long press commits once",
    );
    await f.context.close();
  }
  {
    const f = await fixture();
    const p = await f.pos(f.ball);
    await f.page.mouse.move(p.x, p.y);
    await f.page.mouse.down();
    await f.page.mouse.move(p.x + 50, p.y + 45);
    await f.page.mouse.up();
    await f.page.waitForTimeout(450);
    check(
      (await f.page.locator(".companion-chat").count()) === 0 &&
        f.calls.length === 0,
      "drag cancellation does not become a single tap",
    );
    await f.context.close();
  }
  {
    const f = await fixture();
    await f.ball.focus();
    await f.page.keyboard.press("Shift+Enter");
    await f.page.waitForTimeout(700);
    check(
      (await f.page.locator(".companion-chat").count()) === 1,
      "keyboard chat remains available",
    );
    await f.context.close();
  }
  {
    const f = await fixture();
    const expressions = [];
    for (let pair = 0; pair < 3; pair++) {
      const p = await f.pos(f.ball);
      await f.tap(p);
      await f.page.waitForTimeout(65);
      await f.tap(p);
      await f.page.locator(".companion-chat").waitFor({ state: "detached" });
      await f.page.waitForTimeout(60);
      expressions.push(await f.ball.getAttribute("title"));
    }
    check(
      f.calls.length === 0,
      "repeated touch pairs never read history or send chat",
    );
    check(
      expressions.every((v, i) => !i || v !== expressions[i - 1]),
      "random expressions avoid consecutive repeats",
    );
    await f.context.close();
  }
  {
    const f = await fixture();
    await f.page.emulateMedia({ reducedMotion: "reduce" });
    const p = await f.pos(f.ball);
    await f.tap(p);
    await f.page.waitForTimeout(75);
    await f.tap(p);
    await f.page.waitForTimeout(400);
    check(
      (await f.page.locator(".companion-chat").count()) === 0 &&
        f.calls.length === 0,
      "reduced motion preserves double exclusivity and direct terminal state",
    );
    await f.context.close();
  }
  // After 280ms the single tap is confirmed; the source rect must no longer
  // capture presses, so a real back-button tap still closes the chat.
  for (const kind of ["touch", "mouse"]) {
    const f = await fixture();
    const start = await f.pos(f.ball);
    await f.tap(start, kind);
    await f.page.waitForTimeout(400);
    const back = f.page.locator(
      '.companion-chat button[aria-label="返回宿舍"]',
    );
    const box = await back.boundingBox();
    assert(box);
    const before = await f.ball.getAttribute("title");
    await f.tap({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, kind);
    // A double would activate an expression immediately; a normal back tap
    // only starts the close, which hands the shared ball back later.
    await f.page.waitForTimeout(120);
    check(
      (await f.ball.getAttribute("title")) === before,
      kind + " expired window does not become an expression double tap",
    );
    await f.page.locator(".companion-chat").waitFor({ state: "detached" });
    check(
      (await f.page.locator(".companion-chat").count()) === 0,
      kind +
        " expired window leaves the old source area to the chat back button",
    );
    check(
      f.calls.filter((c) => c.url.includes("/state")).length === 1,
      kind + " expired window keeps exactly one confirmed history read",
    );
    await f.context.close();
  }
  // A press inside the opening window but outside both ball areas must reach
  // the chat instead of being intercepted by the arbiter.
  for (const kind of ["touch", "mouse"]) {
    const f = await fixture();
    const start = await f.pos(f.ball);
    const initial = await f.ball.getAttribute("title");
    await f.tap(start, kind);
    await f.page.waitForTimeout(130);
    const outside = { x: start.x + 280, y: start.y + 16 };
    await f.page.evaluate(() => {
      window.outsidePressReachedChat = false;
      document
        .querySelector(".companion-chat")
        .addEventListener(
          "pointerdown",
          () => (window.outsidePressReachedChat = true),
          { once: true },
        );
    });
    const mark = await f.page.evaluate(() => performance.now());
    await f.tap(outside, kind);
    await f.page.waitForTimeout(300);
    const trace = await f.page.evaluate(() => window.tapTrace);
    check(
      (await f.page.evaluate(() => window.outsidePressReachedChat)) &&
        trace.some(
          (e) =>
            e.type === "click" &&
            e.at >= mark &&
            Math.abs(e.x - outside.x) < 2 &&
            Math.abs(e.y - outside.y) < 2,
        ),
      kind + " press outside both balls reaches the chat operation",
    );
    check(
      (await f.ball.getAttribute("title")) === initial,
      kind + " press outside both balls does not become a double tap",
    );
    check(
      (await f.page.locator(".companion-chat").count()) === 1,
      kind + " press outside both balls keeps the chat open",
    );
    await f.context.close();
  }
  {
    const f = await fixture(true);
    const p = await f.pos(f.ball);
    await f.tap(p);
    await f.page.waitForTimeout(65);
    await f.tap(p);
    await f.page.evaluate(async (point) => {
      window.delayBallClicks = false;
      for (let i = 0; i < 2; i++) {
        const target =
          (i && document.querySelector(".chat-ball .dorm-companion")) ||
          document.querySelector(".companion-identity .dorm-companion");
        target.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            detail: 1,
            clientX: point.x,
            clientY: point.y,
          }),
        );
        await Promise.resolve();
      }
    }, p);
    await f.page.waitForTimeout(700);
    check(
      (await f.page.locator(".companion-chat").count()) === 0 &&
        f.calls.length === 0,
      "two pointer releases before delayed synthetic clicks still produce only one expression interaction",
    );
    await f.context.close();
  }
  check(errors.length === 0, "no uncaught browser exceptions");
  await fs.writeFile(
    new URL(engine + "-gesture.json", out),
    JSON.stringify(
      { engine, checks, results, errors, physicalDevices: false },
      null,
      2,
    ),
  );
} catch (error) {
  let events;
  try {
    events = await activePage?.evaluate(() => window.tapTrace);
  } catch {}
  await fs.writeFile(
    new URL(engine + "-gesture-failure.json", out),
    JSON.stringify({ message: String(error), checks, events }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  await preview.close();
}

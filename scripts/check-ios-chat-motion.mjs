// Browser-level acceptance in an isolated dorm, not physical iPhone validation.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const safari = process.env.DORM_BROWSER === "webkit",
  engine = safari ? "webkit" : "chromium";
const dir = new URL(
  process.env.DORM_IOS_BASELINE
    ? "../data/ios-chat-motion/baseline/"
    : "../data/ios-chat-motion/",
  import.meta.url,
);
await fs.mkdir(dir, { recursive: true });
const preview = await createConversationPreview();
const browser = await (safari ? webkit : chromium).launch({
  headless: true,
  ...(!safari && process.platform === "darwin"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const checks = [],
  errors = [],
  metrics = {};
const check = (value, label) => {
  assert(value, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    return kind === "webgl" ? null : get.call(this, kind, ...args);
  };
  window.qaMotion = {
    tasks: [],
    supported: PerformanceObserver.supportedEntryTypes || [],
    frames: [],
    traces: [],
    reads: 0,
    writes: 0,
    scrollCalls: [],
    mark: {},
  };
  if (window.qaMotion.supported.includes("longtask"))
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.qaMotion.tasks.push({
          start: e.startTime,
          duration: e.duration,
        });
    }).observe({ type: "longtask", buffered: true });
  const original = Element.prototype.getBoundingClientRect;
  window.qaRect = original;
  Element.prototype.getBoundingClientRect = function () {
    if (this.closest?.(".chat-ball") && window.qaMotion.readCount)
      window.qaMotion.reads++;
    return original.call(this);
  };
  const scroll = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (...args) {
    if (this.classList?.contains("chat-history") && window.qaMotion.scrollCount)
      window.qaMotion.scrollCalls.push({
        at: performance.now(),
        behavior: args[0]?.behavior || "auto",
      });
    return scroll.apply(this, args);
  };
  const descriptor = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "scrollTop",
  );
  if (descriptor?.configurable)
    Object.defineProperty(Element.prototype, "scrollTop", {
      ...descriptor,
      set(value) {
        if (
          this.classList?.contains("chat-history") &&
          window.qaMotion.scrollCount
        )
          window.qaMotion.writes++;
        descriptor.set.call(this, value);
      },
    });
  window.qaTrace = () => {
    window.qaMotion.traces = [];
    window.qaMotion.reads = 0;
    window.qaMotion.readCount = true;
    const start = performance.now();
    const frame = (at) => {
      const sampledAt = Number.isFinite(at) ? at : performance.now();
      const root = document.querySelector(".companion-chat"),
        el = root?.querySelector(".chat-ball-visual");
      const r = el && window.qaRect.call(el);
      window.qaMotion.traces.push({
        t: sampledAt - start,
        at: sampledAt,
        exists: !!root,
        x: r ? r.left + r.width / 2 : null,
        y: r ? r.top + r.height / 2 : null,
        w: r?.width,
        footer: root
          ? Number(getComputedStyle(root.querySelector(".chat-footer")).opacity)
          : null,
      });
      if (sampledAt - start < 2100) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  window.qaPerf = () => {
    window.qaMotion.frames = [];
    window.qaMotion.perfStart = performance.now();
    const frame = (t) => {
      window.qaMotion.frames.push(t);
      if (t - window.qaMotion.perfStart < 2200) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
});
const chat = page.locator(".companion-chat"),
  mainBall = page.locator(".companion-identity .dorm-companion");
const hit = async (locator) => {
  const b = await locator.boundingBox();
  assert(b, "interactive surface has geometry");
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};
try {
  await page.goto(preview.url + "/?start=1");
  await mainBall.waitFor();
  await page.waitForTimeout(650);
  await page.evaluate(() => {
    window.qaMotion.mark.start = performance.now();
    window.qaPerf();
    window.qaTrace();
  });
  await mainBall.click();
  await chat.waitFor();
  await page.waitForTimeout(115);
  await page
    .locator(".chat-ball-visual")
    .evaluate((el) => (window.qaSharedVisual = el));
  await page.evaluate(() => (window.qaMotion.mark.close = performance.now()));
  await hit(page.getByRole("button", { name: "返回宿舍", exact: true }));
  await page.waitForTimeout(80);
  check(
    (await chat.count()) === 1,
    "closing keeps the shared ball and chat surface mounted",
  );
  await page.evaluate(() => (window.qaMotion.mark.reopen = performance.now()));
  await hit(page.getByTestId("chat-ball"));
  await page.waitForTimeout(750);
  check(
    (await chat.count()) === 1 &&
      (await page
        .locator(".chat-ball-visual")
        .evaluate((el) => el === window.qaSharedVisual)),
    "tap the returning ball reopens the same visual instance without unmounting",
  );
  metrics.reopened = await page.evaluate(() => {
    const root = document.querySelector(".companion-chat");
    const footer = root?.querySelector(".chat-footer");
    return {
      footer: footer && getComputedStyle(footer).opacity,
      transform: footer && getComputedStyle(footer).transform,
      html: document.documentElement.dataset.companionChat,
      input: root?.querySelector("textarea")?.disabled,
    };
  });
  check(
    await page
      .locator(".chat-footer")
      .evaluate((el) => Number(getComputedStyle(el).opacity) > 0.99),
    "interrupted close cannot finish late and hide the reopened input",
  );
  metrics.travel = await page.evaluate(() => ({
    frames: window.qaMotion.traces,
    reads: window.qaMotion.reads,
    mark: window.qaMotion.mark,
  }));
  const compact = metrics.travel.frames.filter((f) => f.x !== null);
  let jumps = [];
  for (let i = 1; i < compact.length; i++) {
    const dt = compact[i].at - compact[i - 1].at;
    if (dt > 0 && dt < 28) {
      const d = Math.hypot(
        compact[i].x - compact[i - 1].x,
        compact[i].y - compact[i - 1].y,
      );
      if (d > 42) jumps.push({ dt, d });
    }
  }
  check(
    jumps.length === 0,
    "rapid reverse/reopen has no single-frame spatial teleport",
  );
  check(
    metrics.travel.reads < 28,
    "shared travel does not measure ball layout on every rendered frame",
  );
  const reverseFrames = compact.filter(
    (f) =>
      f.at >= metrics.travel.mark.reopen &&
      f.at < metrics.travel.mark.reopen + 160,
  );
  const reverseMinimum = Math.min(...reverseFrames.map((f) => f.x));
  // A 30Hz runner can miss the brief turning point between frames. Preserve
  // the visual samples as evidence; verify actual position and velocity in a
  // same-turn controller probe below instead of inferring them from cadence.
  metrics.travel.turningPointObserved =
    reverseFrames.length >= 4 &&
    reverseMinimum < reverseFrames[0].x - 2 &&
    reverseFrames.at(-1).x > reverseMinimum + 8;
  await page.screenshot({ path: new URL(engine + "-open.png", dir).pathname });
  const editor = page.getByLabel("和球球说句话", { exact: true });
  await editor.click();
  await editor.fill("中断后仍要保留的草稿");
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await chat.waitFor({ state: "hidden" });
  await page.waitForTimeout(200);
  await mainBall.click();
  await chat.waitFor();
  await page.waitForTimeout(650);
  check(
    (await editor.inputValue()) === "中断后仍要保留的草稿",
    "complete close/reopen keeps the unsent draft",
  );
  await editor.click();
  await editor.fill("");
  await page.getByRole("button", { name: "我要留言", exact: true }).click();
  const note = page.getByTestId("conversation-note");
  await note.waitFor();
  await note.evaluate((el) => (window.qaNote = el));
  await page
    .getByRole("group", { name: "留言给谁" })
    .getByRole("button", { name: "张三", exact: true })
    .click();
  await page.waitForTimeout(360);
  await editor.fill("今天晚点回来");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.waitForTimeout(400);
  check(
    (await note.evaluate((el) => el === window.qaNote)) &&
      (await note.getAttribute("data-phase")) === "confirm",
    "message edits project layout inside the original confirmation card",
  );
  await page.screenshot({
    path: new URL(engine + "-confirmation.png", dir).pathname,
  });
  await note.getByRole("button", { name: "取消", exact: true }).click();
  await page.waitForTimeout(75);
  check(
    (await note.count()) === 1,
    "card cancellation has visible reverse exit frames",
  );
  await note.waitFor({ state: "hidden" });
  const send = async (text) => {
    await editor.click();
    await editor.fill(text);
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page.waitForTimeout(1050);
  };
  for (let i = 0; i < 4; i++)
    await send("聊天滚动验收记录，保留这条较长的独立内容 " + i);
  const history = page.getByTestId("chat-history");
  await history.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.qaMotion.scrollCount = true;
    window.qaMotion.writes = 0;
    window.qaMotion.scrollCalls = [];
  });
  const stableBefore = await page
    .locator(".chat-bubble")
    .first()
    .evaluate((el) => {
      window.qaFirst = el;
      return el.getAnimations().length;
    });
  await send("接近底部时使用原生滚动跟随");
  metrics.scroll = await page.evaluate(() => ({
    writes: window.qaMotion.writes,
    calls: window.qaMotion.scrollCalls,
  }));
  check(
    metrics.scroll.calls.some((c) => c.behavior === "smooth") &&
      metrics.scroll.writes < 8,
    "near-bottom append uses native smooth scroll rather than a per-frame scrollTop integrator",
  );
  check(
    await page
      .locator(".chat-bubble")
      .first()
      .evaluate(
        (el) => el === window.qaFirst && el.getAnimations().length === 0,
      ),
    "new messages do not remount or replay existing history bubbles",
  );
  await history.evaluate((el) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -160 }));
    el.scrollTop = 40;
    el.dispatchEvent(new Event("scroll"));
  });
  await send("正在阅读旧消息时也发送一条");
  check(
    await history.evaluate((el) => Math.abs(el.scrollTop - 40) < 3),
    "sending from the fixed input does not forcibly pin a history reader to the bottom",
  );
  await history.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.route(
    "**/chores/companion/chat",
    async (route) => {
      await new Promise((r) => setTimeout(r, 650));
      await route.continue();
    },
    { times: 1 },
  );
  await editor.fill("等待回复时中断跟随");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await history.evaluate((el) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
    el.scrollTop = 55;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(1600);
  check(
    await history.evaluate((el) => Math.abs(el.scrollTop - 55) < 3),
    "late replies respect touch/wheel interruption and history reading",
  );
  // Geometry is simulated, not a physical keyboard. Keep a visible bubble's
  // screen position; unchanged scrollTop alone would miss a padding jump.
  await history.evaluate((el) => {
    el.scrollTop = 260;
    el.dispatchEvent(new Event("scroll"));
  });
  await editor.evaluate((el) => el.focus());
  const anchorBefore = await history.evaluate((el) => {
    const visible = [...el.querySelectorAll(".chat-bubble")].find((node) => {
      const r = node.getBoundingClientRect();
      return r.top >= 210 && r.bottom < 500;
    });
    window.qaReadAnchor = visible;
    return visible?.getBoundingClientRect().top;
  });
  assert(Number.isFinite(anchorBefore), "history has a visible anchor");
  await page.evaluate(() => {
    const v = visualViewport;
    window.qaViewport = { height: v.height, top: v.offsetTop };
    Object.defineProperty(v, "height", { configurable: true, value: 460 });
    Object.defineProperty(v, "offsetTop", { configurable: true, value: 0 });
    v.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(180);
  metrics.keyboardAnchor = {
    before: anchorBefore,
    after: await page.evaluate(
      () => window.qaReadAnchor.getBoundingClientRect().top,
    ),
  };
  check(
    Math.abs(metrics.keyboardAnchor.after - anchorBefore) < 5,
    "keyboard-layout change preserves the visible message anchor rather than only scrollTop",
  );
  await editor.fill("键盘回落仍保留草稿");
  // The back button is intentionally hidden and inert while the compact
  // keyboard layout is active. Exercise the dialog's real Escape close path,
  // then restore the simulated viewport so the close can complete naturally.
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      document.querySelector(".companion-chat")?.getAttribute("data-phase") ===
      "closing",
  );
  check(
    (await chat.getAttribute("data-phase")) === "closing",
    "Escape starts chat close while the keyboard viewport is compact",
  );
  await page.evaluate(() => {
    const v = visualViewport;
    Object.defineProperty(v, "height", {
      configurable: true,
      value: window.qaViewport.height,
    });
    Object.defineProperty(v, "offsetTop", {
      configurable: true,
      value: window.qaViewport.top,
    });
    v.dispatchEvent(new Event("resize"));
  });
  await chat.waitFor({ state: "hidden" });
  check(
    await mainBall.isVisible(),
    "keyboard viewport recovery returns the shared ball to the source",
  );
  // Exercise the real controller, real MotionValues and real browser clock.
  // No fake integrator or production-only test hook is involved. Read both
  // sides of a reversal in the same JS turn so slow screenshot cadence cannot
  // accidentally skip the velocity being verified.
  const controllerBundle = await build({
    entryPoints: ["frontend/src/interaction/chatTravel.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "TravelProbe",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const probe = await context.newPage();
  probe.setDefaultTimeout(10000);
  try {
    await probe.setContent(
      '<div id="ball" style="position:absolute;left:151px;top:48px;width:88px;height:88px;transform-origin:center"><div id="visual" style="width:88px;height:88px"></div></div>',
    );
    await probe.addScriptTag({ content: controllerBundle.outputFiles[0].text });
    await probe.evaluate(() => {
      window.travelProbe = TravelProbe.createChatTravel({
        ball: () => document.getElementById("ball"),
        visual: () => document.getElementById("visual"),
      });
      void window.travelProbe.open(
        { left: 20, top: 20, width: 52, height: 52 },
        { fromClosed: true },
      );
    });
    await probe.waitForFunction(() => {
      const state = window.travelProbe.state();
      return state.x > -110 && state.velocity.x > 50;
    });
    const closingProbe = await probe.evaluate(() => {
      const before = window.travelProbe.state();
      void window.travelProbe.close(() => ({
        left: 20,
        top: 20,
        width: 52,
        height: 52,
      }));
      return { before, after: window.travelProbe.state() };
    });
    await probe.waitForFunction(
      () => window.travelProbe.state().velocity.x < -150,
    );
    const openingProbe = await probe.evaluate(() => {
      const before = window.travelProbe.state();
      void window.travelProbe.open(null);
      return { before, after: window.travelProbe.state() };
    });
    metrics.velocityProbe = { closing: closingProbe, opening: openingProbe };
    check(
      [closingProbe, openingProbe].every(({ before, after }) =>
        ["x", "y", "scale"].every(
          (key) =>
            // Motion.stop can flush the old spring to the current timestamp;
            // allow that bounded sub-frame advance, but never a reset in
            // position, direction or incoming velocity.
            Math.abs(before[key] - after[key]) <
              Math.abs(before.velocity[key]) / 30 +
                (key === "scale" ? 0.01 : 1) &&
            Math.sign(before.velocity[key]) ===
              Math.sign(after.velocity[key]) &&
            Math.abs(after.velocity[key]) >
              Math.abs(before.velocity[key]) * 0.25 &&
            Math.abs(after.velocity[key]) <
              Math.abs(before.velocity[key]) * 3 + 0.01,
        ),
      ),
      "reverse retains incoming motion in both directions without a position or velocity reset",
    );
    await probe.evaluate(() => window.travelProbe.destroy());
  } finally {
    await probe.close();
    await page.bringToFront();
  }
  // Separate timing-only pass: no per-frame geometry sampler during perf recording.
  await page.evaluate(() => {
    window.qaMotion.readCount = false;
    window.qaPerf();
  });
  await mainBall.click();
  await chat.waitFor();
  await page.waitForTimeout(750);
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await chat.waitFor({ state: "hidden" });
  await page.waitForTimeout(1000);
  metrics.performance = await page.evaluate(() => {
    const q = window.qaMotion,
      ds = q.frames
        .slice(1)
        .map((t, i) => t - q.frames[i])
        .sort((a, b) => a - b);
    return {
      supported: q.supported,
      longTaskStatus: q.supported.includes("longtask")
        ? "supported"
        : "unsupported",
      longTasks: q.supported.includes("longtask")
        ? q.tasks.filter((t) => t.start >= q.perfStart)
        : null,
      samples: ds.length,
      p50: ds[Math.floor(ds.length * 0.5)],
      p95: ds[Math.floor(ds.length * 0.95)],
      maximum: ds.at(-1),
      over32: ds.filter((d) => d > 32).length,
    };
  });
  check(
    metrics.performance.samples > 20,
    "Performance Timeline records real frame intervals for an open/close pass",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mainBall.click();
  await chat.waitFor();
  await page.waitForTimeout(100);
  check(
    await page
      .locator(".chat-footer")
      .evaluate(
        (el) =>
          getComputedStyle(el).opacity === "1" &&
          getComputedStyle(el).transform === "none",
      ),
    "reduced motion draws the final state without spring travel",
  );
  await page.screenshot({ path: new URL(engine + "-final.png", dir).pathname });
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await chat.waitFor({ state: "hidden" });
  check(
    errors.length === 0,
    "no runtime errors across interrupted travel, native scrolling and confirmation flow",
  );
  await fs.writeFile(
    new URL(engine + "-result.json", dir),
    JSON.stringify(
      {
        status: "passed",
        engine,
        checks,
        metrics,
        errors,
        limits: [
          "Physical iPhone and real iOS soft keyboard are not tested.",
          "Desktop WebKit is not iPhone Safari.",
          "Frame metrics are local measurements with WebGL disabled for deterministic test rendering.",
          "Unsupported longtask entries are reported as unsupported, not zero.",
        ],
      },
      null,
      2,
    ),
  );
} catch (e) {
  await fs.writeFile(
    new URL(engine + "-failure.json", dir),
    JSON.stringify({ error: e.message, checks, metrics, errors }, null, 2),
  );
  await page
    .screenshot({ path: new URL(engine + "-failure.png", dir).pathname })
    .catch(() => {});
  throw e;
} finally {
  await context.close();
  await browser.close();
  await preview.close();
}

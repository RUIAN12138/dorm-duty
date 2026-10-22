// Real browser simulation of visualViewport keyboard stages. This is not a
// physical keyboard/IME acceptance run; it records actual layout geometry.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const out = new URL("../data/chat-keyboard-viewport/", import.meta.url);
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
const checks = [],
  errors = [],
  metrics = { stages: [], engines: engine };
const check = (ok, label) => {
  assert(ok, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
const history = Array.from({ length: 120 }, (_, i) => ({
  role: i % 2 ? "assistant" : "user",
  messages: ["历史第" + i + "条：保留滚动位置与键盘锚点。"],
  emotion: "02",
  request_id: "seed-" + i,
}));
async function seed(page) {
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/chores/companion/state?*", (route) =>
    route.fulfill({
      json: {
        available: true,
        voice_available: false,
        messages: history,
        reminders: [],
      },
    }),
  );
  await page.goto(preview.url + "/?start=1");
  const ball = page.locator(".companion-identity .dorm-companion");
  await ball.waitFor();
  await page.waitForTimeout(450);
  await ball.click();
  await page.locator(".companion-chat").waitFor();
  await page.waitForTimeout(750);
  return ball;
}
async function installViewportHandle(page) {
  await page.evaluate(() => {
    const v = visualViewport;
    window.qaOriginalViewport = {
      height: v.height,
      offsetTop: v.offsetTop,
      width: v.width,
      scale: v.scale,
    };
    window.qaRestoreViewport = () => {
      // The overrides are own properties created above; deleting them reveals
      // the native VisualViewport prototype getters again.
      for (const key of ["height", "offsetTop", "width", "scale"])
        delete v[key];
      v.dispatchEvent(new Event("resize"));
    };
    window.qaStage = (stage) => {
      const values = {
        height: stage.height,
        offsetTop: stage.top ?? 0,
        width: stage.width ?? window.qaOriginalViewport.width,
        scale: stage.scale ?? 1,
      };
      for (const [key, value] of Object.entries(values))
        Object.defineProperty(v, key, {
          configurable: true,
          get: () => value,
        });
      v.dispatchEvent(new Event("resize"));
      v.dispatchEvent(new Event("scroll"));
    };
    window.qaMeasure = () => {
      const root = document.querySelector(".companion-chat");
      if (!root) return null;
      const vv = visualViewport;
      const rel = (el) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top - vv.offsetTop,
          left: r.left - vv.offsetLeft,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
        };
      };
      const composer = root.querySelector(".composer-text");
      const form = root.querySelector(".chat-composer");
      const scroller = root.querySelector(".chat-history");
      return {
        vv: {
          height: vv.height,
          top: vv.offsetTop,
          width: vv.width,
          scale: vv.scale,
        },
        root: rel(root),
        composer: rel(composer),
        form: rel(form),
        distance:
          vv.offsetTop + vv.height - composer.getBoundingClientRect().bottom,
        formDistance:
          vv.offsetTop + vv.height - form.getBoundingClientRect().bottom,
        inset: parseFloat(
          getComputedStyle(root).getPropertyValue("--chat-keyboard-inset"),
        ),
        keyboard: root.classList.contains("is-keyboard"),
        compact: root.classList.contains("is-compact"),
        ball: rel(root.querySelector(".chat-ball-visual")),
        box: rel(root.querySelector(".chat-ball")),
        nameplate: rel(root.querySelector(".chat-nameplate")),
        toolbar: rel(root.querySelector(".chat-toolbar button")),
        frost: rel(root.querySelector(".chat-top-frost")),
        noteShortcut: !!root.querySelector(".chat-note-shortcut"),
        historyGap:
          scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight,
        historyTop: scroller.scrollTop,
      };
    };
  });
}
const measure = (page) => page.evaluate(() => window.qaMeasure());
const setStage = async (page, stage) => {
  await page.evaluate((value) => window.qaStage(value), stage);
  await page.waitForTimeout(100);
};
const idleGap = (height) => Math.max(10, 58 - Math.max(0, 844 - height));
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
function assertStable(label, before, after) {
  for (const key of ["ball", "nameplate", "toolbar"]) {
    check(
      near(after[key].top, before[key].top, 0.75) &&
        near(after[key].width, before[key].width, 0.75),
      label + ": " + key + " stays fixed against the visual top",
    );
  }
  check(
    near(after.frost.height, before.frost.height, 0.75) &&
      near(after.frost.top, before.frost.top, 0.75),
    label + ": top frost keeps its visual position and size",
  );
}
let page, context;
try {
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page = await context.newPage();
  const ball = await seed(page);
  await installViewportHandle(page);
  const editor = page.getByLabel("和球球说句话", { exact: true });
  const initial = await measure(page);
  check(
    initial.historyGap < 2,
    "initial long history is pinned to the latest message",
  );
  check(
    near(initial.distance, 58, 1.5) && !initial.compact && !initial.keyboard,
    "no-keyboard entry keeps the original 58px footer gap",
  );
  check(
    near(initial.ball.width, 88, 0.75),
    "normal entry keeps the full-size ball",
  );
  metrics.initial = initial;

  await page.locator(".composer-text").click();
  await editor.focus();
  await page.waitForTimeout(80);

  const stages = [
    { height: 830, top: 0 },
    { height: 810, top: 0 },
    { height: 790, top: 0 },
    { height: 700, top: 0 },
    { height: 560, top: 0 },
    { height: 420, top: 20 },
    { height: 336, top: 0 },
  ];
  let previousDistance = initial.distance;
  for (const [index, stage] of stages.entries()) {
    await setStage(page, stage);
    const state = await measure(page);
    metrics.stages.push({ stage, state });
    check(
      near(state.root.top, 0, 0.75) &&
        near(state.root.height, state.vv.height, 0.75),
      "stage " + index + ": root follows the real visual viewport",
    );
    check(
      near(state.distance, idleGap(stage.height), 1.5) &&
        near(state.distance, state.formDistance, 0.75),
      "stage " + index + ": composer outer edge converges continuously",
    );
    check(
      state.distance <= previousDistance + 0.75 && state.distance >= 9.5,
      "stage " + index + ": gap never jumps back or below 10px",
    );
    check(
      state.keyboard === stage.height < 734,
      "stage " + index + ": keyboard latch matches real occlusion",
    );
    assertStable("stage " + index, initial, state);
    previousDistance = state.distance;
  }
  const finalStage = metrics.stages.at(-1).state;
  check(
    near(finalStage.distance, 10, 0.75),
    "fully open keyboard leaves exactly 10px to the composer",
  );
  check(
    !finalStage.compact && finalStage.ball.width === initial.ball.width,
    "keyboard does not trigger the compact header or resize the ball",
  );

  // Candidate bar grows and shrinks while the keyboard stays attached.
  await setStage(page, { height: 300, top: 0 });
  const candidateUp = await measure(page);
  await setStage(page, { height: 340, top: 0 });
  const candidateDown = await measure(page);
  metrics.candidateBar = { up: candidateUp, down: candidateDown };
  check(
    candidateUp.keyboard &&
      candidateDown.keyboard &&
      near(candidateUp.distance, 10, 0.75) &&
      near(candidateDown.distance, 10, 0.75),
    "candidate bar rise/fall keeps the composer attached at 10px",
  );
  assertStable("candidate bar", initial, candidateUp);

  // Blur arrives before the visual viewport restores.
  await editor.evaluate((el) => el.blur());
  await page.waitForTimeout(100);
  const blurred = await measure(page);
  metrics.blurred = blurred;
  check(
    blurred.keyboard && near(blurred.distance, 10, 0.75),
    "blur before keyboard recovery keeps the attached footer",
  );
  for (const height of [600, 780, 844]) {
    await setStage(page, { height, top: 0 });
    const state = await measure(page);
    if (height < 844)
      check(
        state.keyboard && near(state.distance, 10, 0.75),
        "partial keyboard recovery at " + height + " still follows",
      );
    else {
      check(
        !state.keyboard && near(state.distance, 58, 1.5) && state.noteShortcut,
        "full visual recovery restores the original footer and shortcut",
      );
      check(
        near(state.ball.width, initial.ball.width, 0.75) &&
          near(state.ball.top, initial.ball.top, 0.75),
        "full visual recovery restores the original ball geometry",
      );
    }
  }

  // Cancellation can happen before the 110px keyboard threshold is crossed.
  await editor.focus();
  await setStage(page, { height: 804, top: 0 });
  await editor.evaluate((el) => el.blur());
  await setStage(page, { height: 804, top: 0 });
  const earlyBlur = await measure(page);
  metrics.earlyBlur = earlyBlur;
  check(
    near(earlyBlur.distance, 18, 0.75),
    "blur during early keyboard growth retains partial geometry until recovery",
  );
  await setStage(page, { height: 844, top: 0 });
  check(
    near((await measure(page)).distance, 58, 1.5),
    "early keyboard cancellation returns to the original resting gap",
  );

  // Reader anchor: a visible history bubble must not move when the keyboard
  // changes the scroller height and footer padding.
  const scroller = page.getByTestId("chat-history");
  await scroller.evaluate((el) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -200 }));
    el.scrollTop = 420;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(80);
  const anchorBefore = await scroller.evaluate((el) => {
    const node = [...el.querySelectorAll(".chat-bubble")].find((item) => {
      const r = item.getBoundingClientRect();
      return r.top >= 210 && r.bottom < 500;
    });
    window.qaReadAnchor = node;
    return node?.getBoundingClientRect().top;
  });
  check(Number.isFinite(anchorBefore), "reader has a visible history anchor");
  await editor.focus();
  await setStage(page, { height: 500, top: 0 });
  const anchorKeyboard = await scroller.evaluate(
    () => window.qaReadAnchor.getBoundingClientRect().top,
  );
  await setStage(page, { height: 844, top: 0 });
  const anchorRestored = await scroller.evaluate(
    () => window.qaReadAnchor.getBoundingClientRect().top,
  );
  metrics.readerAnchor = {
    before: anchorBefore,
    keyboard: anchorKeyboard,
    restored: anchorRestored,
  };
  check(
    near(anchorKeyboard, anchorBefore, 5),
    "keyboard layout preserves the visible history anchor",
  );
  check(
    near(anchorRestored, anchorBefore, 5),
    "keyboard recovery preserves the same history anchor",
  );

  // Near-bottom follower keeps the latest message visible.
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(80);
  await setStage(page, { height: 500, top: 0 });
  const followed = await measure(page);
  check(
    followed.historyGap < 2,
    "near-bottom reader keeps the latest message visible after keyboard open",
  );
  await setStage(page, { height: 844, top: 0 });

  // Pinch zoom is a coordinate change, not a soft keyboard.
  await setStage(page, { height: 560, top: 0, width: 260, scale: 1.5 });
  const zoomed = await measure(page);
  metrics.pinch = zoomed;
  check(
    !zoomed.keyboard && near(zoomed.distance, 58, 1.5) && zoomed.noteShortcut,
    "pinch scale change is not treated as a soft keyboard",
  );
  assertStable("pinch", initial, zoomed);
  await setStage(page, { height: 844, top: 0, width: 390, scale: 1 });
  const zoomRestored = await measure(page);
  check(
    !zoomRestored.keyboard && near(zoomRestored.distance, 58, 1.5),
    "pinch recovery returns to the idle layout",
  );

  // Simulated 34px safe area: the idle gap is 68px, but an attached keyboard
  // still ends at 10px rather than re-adding the safe-area 34px.
  await page.evaluate(() => {
    document
      .querySelector(".chat-surface")
      .style.setProperty("--chat-safe-bottom", "34px");
  });
  await page.waitForTimeout(80);
  const safeIdle = await measure(page);
  check(
    near(safeIdle.distance, 68, 1.5),
    "simulated safe area keeps the original idle footer gap",
  );
  await setStage(page, { height: 336, top: 0 });
  const safeKeyboard = await measure(page);
  metrics.safeArea = { idle: safeIdle, keyboard: safeKeyboard };
  check(
    near(safeKeyboard.distance, 10, 0.75),
    "safe area is not added on top of an attached keyboard",
  );
  await setStage(page, { height: 844, top: 0 });
  await page.evaluate(() => {
    document
      .querySelector(".chat-surface")
      .style.removeProperty("--chat-safe-bottom");
  });
  await page.waitForTimeout(80);
  check(
    near((await measure(page)).distance, 58, 1.5),
    "removing the simulated safe area restores the idle gap",
  );

  // Many synchronous events share a single rAF/layout update.
  await editor.focus();
  await page.evaluate(() => {
    window.qaStyleMutations = 0;
    window.qaInsetWrites = 0;
    const root = document.querySelector(".companion-chat");
    window.qaStyleObserver = new MutationObserver(
      (records) => (window.qaStyleMutations += records.length),
    );
    window.qaStyleObserver.observe(root, {
      attributes: true,
      attributeFilter: ["style"],
    });
    // Vue writes custom properties through setProperty. Counting this one
    // proves the burst was reduced to one state commit, independent of other
    // Reka style bookkeeping on the same element.
    const proto = CSSStyleDeclaration.prototype;
    window.qaOriginalSetProperty = proto.setProperty;
    proto.setProperty = function (name, ...args) {
      if (name === "--chat-keyboard-inset" && this === root.style)
        window.qaInsetWrites++;
      return window.qaOriginalSetProperty.call(this, name, ...args);
    };
    for (const height of [760, 700, 640, 580, 520, 460]) {
      window.qaStage({ height, top: 0 });
    }
  });
  await page.waitForTimeout(120);
  const coalesced = await measure(page);
  const { mutations, writes } = await page.evaluate(() => {
    window.qaStyleObserver.disconnect();
    CSSStyleDeclaration.prototype.setProperty = window.qaOriginalSetProperty;
    return {
      mutations: window.qaStyleMutations,
      writes: window.qaInsetWrites,
    };
  });
  metrics.coalesced = { mutations, writes, state: coalesced };
  check(
    writes === 1 && near(coalesced.distance, 10, 0.75),
    "a burst of viewport events produces one coalesced layout update",
  );
  await setStage(page, { height: 844, top: 0 });

  // Draft survives keyboard open/close and a real close/reopen.
  await editor.fill("键盘开合后仍保留的草稿");
  await editor.focus();
  await setStage(page, { height: 500, top: 0 });
  await setStage(page, { height: 844, top: 0 });
  check(
    (await editor.inputValue()) === "键盘开合后仍保留的草稿",
    "keyboard open/close retains the unsent draft",
  );
  await setStage(page, { height: 500, top: 0 });
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await setStage(page, { height: 844, top: 0 });
  await page.locator(".companion-chat").waitFor({ state: "hidden" });
  await page.waitForTimeout(250);
  await ball.click();
  await page.locator(".companion-chat").waitFor();
  await page.waitForTimeout(700);
  const keyboardReopen = await measure(page);
  check(
    near(keyboardReopen.root.height, 844, 0.75) &&
      near(keyboardReopen.distance, 58, 1.5),
    "close with keyboard then reopen reapplies the recovered viewport snapshot",
  );
  check(
    (await editor.inputValue()) === "键盘开合后仍保留的草稿" &&
      (await editor.getAttribute("readonly")) !== null,
    "reopen keeps the draft without auto-focusing the keyboard",
  );
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await page.locator(".companion-chat").waitFor({ state: "hidden" });
  await page.waitForTimeout(250);

  // Short screen: compact is an entry decision, not a keyboard reaction.
  await page.evaluate(() => window.qaRestoreViewport());
  await page.waitForTimeout(80);
  await page.setViewportSize({ width: 390, height: 520 });
  await page.waitForTimeout(120);
  await ball.click();
  await page.locator(".companion-chat").waitFor();
  await page.waitForTimeout(700);
  await installViewportHandle(page);
  const shortIdle = await measure(page);
  check(
    shortIdle.compact && near(shortIdle.distance, 12, 1.5),
    "short screen decides compact and its 12px idle gap on entry",
  );
  await page.locator(".composer-text").click();
  await editor.focus();
  await setStage(page, { height: 300, top: 0 });
  const shortKeyboard = await measure(page);
  metrics.shortScreen = { idle: shortIdle, keyboard: shortKeyboard };
  check(
    shortKeyboard.keyboard &&
      near(shortKeyboard.distance, 10, 0.75) &&
      near(shortKeyboard.ball.width, shortIdle.ball.width, 0.75),
    "short-screen keyboard attaches the composer without changing the ball",
  );
  await setStage(page, { height: 520, top: 0 });
  const shortRestored = await measure(page);
  check(
    !shortRestored.keyboard && near(shortRestored.distance, 12, 1.5),
    "short-screen keyboard recovery restores its 12px layout",
  );
  await page.screenshot({
    path: new URL(engine + "-keyboard.png", out).pathname,
  });

  // Resize-only WebView / missing VisualViewport.
  const fallbackContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await fallbackContext.addInitScript(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      get: () => undefined,
    });
  });
  const fallback = await fallbackContext.newPage();
  await seed(fallback);
  const fallbackEditor = fallback.getByLabel("和球球说句话", {
    exact: true,
  });
  check(
    await fallback.evaluate(() => window.visualViewport === undefined),
    "fallback page has no VisualViewport",
  );
  const fallbackIdle = await fallback.evaluate(() => {
    const root = document.querySelector(".companion-chat");
    const composer = root.querySelector(".composer-text");
    return {
      distance: innerHeight - composer.getBoundingClientRect().bottom,
      height: root.getBoundingClientRect().height,
      ball: root.querySelector(".chat-ball-visual").getBoundingClientRect().top,
    };
  });
  await fallback.locator(".composer-text").click();
  await fallbackEditor.focus();
  await fallback.setViewportSize({ width: 390, height: 500 });
  await fallback.waitForTimeout(220);
  const fallbackKeyboard = await fallback.evaluate(() => {
    const root = document.querySelector(".companion-chat");
    const composer = root.querySelector(".composer-text");
    return {
      distance: innerHeight - composer.getBoundingClientRect().bottom,
      height: root.getBoundingClientRect().height,
      ball: root.querySelector(".chat-ball-visual").getBoundingClientRect().top,
      keyboard: root.classList.contains("is-keyboard"),
    };
  });
  metrics.fallback = { idle: fallbackIdle, keyboard: fallbackKeyboard };
  check(
    fallbackKeyboard.keyboard &&
      near(fallbackKeyboard.distance, 10, 0.75) &&
      near(fallbackKeyboard.height, 500, 0.75),
    "resize-only WebView attaches the composer without VisualViewport",
  );
  check(
    near(fallbackKeyboard.ball - fallbackIdle.ball, 0, 0.75),
    "resize-only WebView keeps the ball fixed against the visual top",
  );
  await fallback.setViewportSize({ width: 390, height: 844 });
  await fallback.waitForTimeout(220);
  const fallbackRestored = await fallback.evaluate(() => {
    const root = document.querySelector(".companion-chat");
    const composer = root.querySelector(".composer-text");
    return {
      distance: innerHeight - composer.getBoundingClientRect().bottom,
      keyboard: root.classList.contains("is-keyboard"),
    };
  });
  check(
    !fallbackRestored.keyboard && near(fallbackRestored.distance, 58, 1.5),
    "resize-only WebView restores the idle footer after keyboard close",
  );
  await fallbackContext.close();

  check(errors.length === 0, "no browser runtime errors");
  await fs.writeFile(
    new URL(engine + "-result.json", out),
    JSON.stringify(
      {
        engine,
        status: "passed",
        checks,
        metrics,
        errors,
        limitations: [
          "Keyboard geometry is simulated through visualViewport/property changes; no physical IME or hardware keyboard was used.",
          "Desktop Chromium/WebKit rendering does not validate Safari/iPhone candidate-bar optics or Android WebView compositing.",
          "Safe area is simulated through the local --chat-safe-bottom variable, not a notched physical device.",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page
    ?.screenshot({ path: new URL(engine + "-failure.png", out).pathname })
    .catch(() => {});
  await fs.writeFile(
    new URL(engine + "-failure.json", out),
    JSON.stringify({ error: error.message, checks, metrics, errors }, null, 2),
  );
  throw error;
} finally {
  await context?.close();
  await browser.close();
  await preview.close();
}

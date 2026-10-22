import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { _android } from "../frontend/node_modules/playwright/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const safari = process.env.DORM_BROWSER === "webkit",
  android = process.env.DORM_ANDROID_WEBVIEW === "1",
  ark = process.env.DORM_ARKWEB === "1",
  native = android || ark;
const engine = ark
  ? "arkweb"
  : android
    ? "android-webview"
    : safari
      ? "webkit"
      : "chromium";
const preview = await createConversationPreview();
let browser, page;
const dir = new URL("../data/chat-motion-continuity/", import.meta.url);
await fs.mkdir(dir, { recursive: true });
const checks = [],
  errors = [],
  metrics = {};
const check = (condition, label) => {
  assert(condition, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
try {
  if (android) {
    const device = (await _android.devices()).find(
      (d) => d.serial() === "emulator-5554",
    );
    assert(device);
    page = await (await device.webView({ pkg: "cn.lundao.preview" })).page();
  } else if (ark) {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9227");
    page = browser.contexts()[0].pages()[0];
  } else {
    browser = await (safari ? webkit : chromium).launch({
      headless: true,
      ...(!safari
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
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(20000);
  await page.goto(
    (native ? `http://10.0.2.2:${preview.port}` : preview.url) +
      "/calendar?start=1",
  );
  const selector = page.locator(".calendar-view-selector");
  await selector.waitFor();
  await page.waitForTimeout(700);
  const grid = page.locator('[data-calendar-panel="calendar"]'),
    list = page.locator('[data-calendar-panel="list"]'),
    stats = page.locator('[data-calendar-panel="stats"]');
  const active = () =>
    page
      .locator('.calendar-view-selector [data-state="active"]')
      .getAttribute("data-testid");
  await page.evaluate(() => {
    window.initialGrid = document.querySelector(".month-stage");
    window.calendarMonth =
      document.querySelector("#calendar-title").textContent;
  });
  const box = await selector.boundingBox(),
    cell = box.width / 3,
    y = box.y + box.height / 2,
    x = box.x + cell / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + cell * 0.36, y, { steps: 3 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const dragged = await selector
    .locator(".segment-indicator")
    .evaluate((el) => getComputedStyle(el).transform);
  check(
    dragged !== "none" && new DOMMatrixFallback(dragged).x > 5,
    "indicator follows continuous finger positions before reaching a neighboring center",
  );
  await page.mouse.move(x + cell, y, { steps: 4 });
  await page.waitForTimeout(45);
  check(
    (await active()) === "calendar-view-list" &&
      (await list.getAttribute("data-state")) === "active",
    "list becomes selected and starts entering before finger release",
  );
  await page.mouse.move(x + cell * 2, y, { steps: 4 });
  await page.waitForTimeout(45);
  check(
    (await active()) === "calendar-view-stats" &&
      (await stats.getAttribute("data-state")) === "active",
    "scrub reaches cards before release without waiting for queued pages",
  );
  await page.mouse.up();
  await page.waitForTimeout(600);
  check(
    (await active()) === "calendar-view-stats",
    "release snaps to the selected card mode without a synthetic-click reversal",
  );
  await page.locator(".swipe-card-deck").waitFor();
  const activityCalls = () => preview.counts.get("GET /chores/activity") || 0;
  const calls = activityCalls();
  await page.getByTestId("calendar-view-grid").click();
  await page.waitForTimeout(360);
  await page.getByTestId("calendar-view-list").click();
  await page.waitForTimeout(360);
  await page.evaluate(() => {
    window.savedList = document.querySelector(".compact-records");
    const el = document.querySelector(".folded-record-page");
    const spacer = document.createElement("div");
    spacer.id = "scroll-only-fixture";
    spacer.style.height = "1300px";
    el.appendChild(spacer);
    el.scrollTop = 120;
    el.dispatchEvent(new Event("scroll"));
    window.savedListScroll = el.scrollTop;
  });
  await page.getByTestId("calendar-view-stats").click();
  await page.waitForTimeout(400);
  await page.getByTestId("calendar-view-list").click();
  await page.waitForTimeout(400);
  check(
    await page.evaluate(
      () =>
        document.querySelector(".compact-records") === window.savedList &&
        Math.abs(
          document.querySelector(".folded-record-page").scrollTop -
            window.savedListScroll,
        ) < 2,
    ),
    "list instance and actual scroll position survive mode switches",
  );
  await page.evaluate(() => {
    document.getElementById("scroll-only-fixture").remove();
  });
  check(
    activityCalls() === calls,
    "cached cards reuse loaded data without a new activity request",
  );
  await page.evaluate(() => {
    window.gridFrames = [];
    window.gridStart = performance.now();
    const sample = () => {
      const el = document.querySelector('[data-calendar-panel="calendar"]'),
        s = getComputedStyle(el);
      window.gridFrames.push({
        t: performance.now() - window.gridStart,
        opacity: Number(s.opacity),
        transform: s.transform,
        visibility: s.visibility,
      });
      if (performance.now() - window.gridStart < 500)
        requestAnimationFrame(sample);
    };
    sample();
  });
  await page.getByTestId("calendar-view-grid").click();
  await page.waitForTimeout(520);
  metrics.grid = await page.evaluate(() => window.gridFrames);
  check(
    metrics.grid.filter((f) => f.opacity > 0.01 && f.opacity < 0.99).length >=
      3,
    "cached calendar re-entry has multiple visible opacity/translation/spring intermediate frames",
  );
  check(
    await page.evaluate(
      () =>
        document.querySelector(".month-stage") === window.initialGrid &&
        document.querySelector("#calendar-title").textContent ===
          window.calendarMonth,
    ),
    "calendar month and grid instance survive list and card visits",
  );
  check(
    (await page
      .locator('[data-calendar-panel="calendar"] .loading-skeleton')
      .count()) === 0,
    "cached calendar does not flash a new skeleton",
  );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + cell, y, { steps: 4 });
  await page.waitForTimeout(30);
  await page.mouse.move(x + cell, box.y - 35);
  await page.mouse.up();
  await page.waitForTimeout(360);
  check(
    (await active()) === "calendar-view-grid",
    "leaving the hit region cancels scrub and returns to the original mode",
  );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 3, y + 30, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  check(
    (await active()) === "calendar-view-grid",
    "vertical intent does not switch modes or steal vertical scrolling",
  );
  await page.getByTestId("calendar-view-stats").click();
  await page.waitForTimeout(40);
  await page.getByTestId("calendar-view-list").click();
  await page.waitForTimeout(40);
  await page.getByTestId("calendar-view-grid").click();
  await page.waitForTimeout(480);
  check(
    await page
      .locator(".calendar-mode-stack > [data-calendar-panel]")
      .evaluateAll(
        (els) =>
          els.filter((el) => getComputedStyle(el).visibility === "visible")
            .length === 1,
      ),
    "rapid reverse ends with one visible panel and no residual overlays",
  );
  await page.evaluate(() => {
    window.segmentSelections = [];
    window.segmentObserver = new MutationObserver(() =>
      window.segmentSelections.push(
        document.querySelector('.calendar-view-selector [data-state="active"]')
          ?.dataset.testid,
      ),
    );
    window.segmentObserver.observe(
      document.querySelector(".calendar-view-selector"),
      { subtree: true, attributes: true, attributeFilter: ["data-state"] },
    );
  });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + cell * 2, y, { steps: 1 });
  await page.mouse.up();
  await page.waitForTimeout(360);
  check(
    (await active()) === "calendar-view-stats" &&
      (await page.evaluate(
        () => !window.segmentSelections.includes("calendar-view-list"),
      )),
    "one fast first-to-third scrub selects cards directly without forcing a list transition",
  );
  await page.evaluate(() => window.segmentObserver.disconnect());
  await page.getByTestId("calendar-view-grid").click();
  await page.waitForTimeout(360);
  await page.getByTestId("calendar-next").click();
  await page.waitForTimeout(500);
  const changed = await page.locator("#calendar-title").textContent();
  await page.getByTestId("calendar-view-list").click();
  await page.waitForTimeout(340);
  await page.getByTestId("calendar-view-grid").click();
  await page.waitForTimeout(340);
  check(
    (await page.locator("#calendar-title").textContent()) === changed,
    "month choice is not reset when switching modes",
  );
  if (!native) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("calendar-view-list").click();
    await page.waitForTimeout(90);
    check(
      await list.evaluate(
        (el) =>
          getComputedStyle(el).transform === "none" &&
          getComputedStyle(el).opacity === "1",
      ),
      "reduced motion switches directly to final panel state",
    );
  }
  if (!safari) {
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      window.nativeTouches = [];
      for (const name of [
        "pointerdown",
        "pointermove",
        "pointercancel",
        "pointerup",
        "touchstart",
        "touchmove",
      ])
        document.addEventListener(
          name,
          (e) =>
            window.nativeTouches.push({
              type: name,
              x: e.clientX,
              y: e.clientY,
              primary: e.isPrimary,
              button: e.button,
              cls: e.target.className,
            }),
          true,
        );
    });
    const r = await selector.boundingBox(),
      sy = r.y + r.height / 2;
    const sx = r.x + r.width / 6,
      ex = r.x + (r.width * 5) / 6;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: sx, y: sy }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: sx + ((ex - sx) * i) / 8, y: sy }],
      });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    metrics.nativeTouches = await page.evaluate(() => window.nativeTouches);
    await fs.writeFile(
      new URL(engine + "-native-touches.json", dir),
      JSON.stringify(metrics.nativeTouches, null, 2),
    );
    check(
      (await active()) === "calendar-view-stats",
      "browser touch scrub selects cards before touch release",
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(360);
    check(
      (await active()) === "calendar-view-stats",
      "browser touch release settles without a click reversal",
    );
    await cdp.detach();
  }
  await page.screenshot({
    path: new URL(engine + "-calendar.png", dir).pathname,
  });
  check(errors.length === 0, "no runtime errors in scoped calendar navigation");
  await fs.writeFile(
    new URL(engine + "-calendar-result.json", dir),
    JSON.stringify(
      {
        status: "passed",
        engine,
        checks,
        metrics,
        errors,
        limits: [
          "Desktop pointer dragging is not a physical iPhone touch test.",
          "Scroll retention uses a temporary test-only spacer; no product records are changed.",
        ],
      },
      null,
      2,
    ),
  );
} catch (e) {
  await page
    ?.screenshot({
      path: new URL(engine + "-calendar-failure.png", dir).pathname,
    })
    .catch(() => {});
  throw e;
} finally {
  await browser?.close();
  await preview.close();
}
function DOMMatrixFallback(value) {
  this.x =
    Number(
      value.replace(/^matrix(3d)?\(/, "").split(",")[
        value.startsWith("matrix3d") ? 12 : 4
      ],
    ) || 0;
}

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
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
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const checks = [],
  errors = [];
const check = (value, label) => {
  assert(value, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
page.on("pageerror", (e) => errors.push(e.message));
const history = Array.from({ length: 120 }, (_, i) => ({
  role: i % 2 ? "assistant" : "user",
  messages: ["历史第" + i + "条：保留滚动位置与自然对话。"],
  emotion: "02",
  request_id: "seed-" + i,
}));
await page.route("**/chores/companion/state?*", async (route) => {
  await new Promise((r) => setTimeout(r, 180));
  await route.fulfill({
    json: {
      available: true,
      voice_available: false,
      messages: history,
      reminders: [],
    },
  });
});
await page.addInitScript(() => {
  window.entryQA = { calls: [], frames: [], active: false };
  const native = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (...args) {
    if (this.classList?.contains("chat-history"))
      window.entryQA.calls.push({
        behavior: args[0]?.behavior,
        top: args[0]?.top,
        at: performance.now(),
      });
    return native.apply(this, args);
  };
  function frame() {
    const el = document.querySelector(".chat-history"),
      host = document.querySelector(".chat-history-content");
    if (window.entryQA.active && el && host) {
      let visible = true;
      for (let n = host; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (
          s.visibility === "hidden" ||
          s.display === "none" ||
          Number(s.opacity) < 0.05
        )
          visible = false;
      }
      if (host.querySelector(".chat-bubble") && visible)
        window.entryQA.frames.push({
          top: el.scrollTop,
          gap: el.scrollHeight - el.clientHeight - el.scrollTop,
          at: performance.now(),
        });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
try {
  await page.goto(preview.url + "/?start=1");
  const ball = page.locator(".companion-identity .dorm-companion");
  await ball.waitFor();
  await page.waitForTimeout(400);
  for (let open = 0; open < 2; open++) {
    await page.evaluate(() => {
      window.entryQA.frames = [];
      window.entryQA.calls = [];
      window.entryQA.active = true;
    });
    await ball.click();
    await page.waitForFunction(() => window.entryQA.frames.length > 4);
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => window.entryQA);
    check(
      result.frames[0].gap < 3,
      "open " + open + " first visible long-history frame is already at bottom",
    );
    check(
      !result.calls.some((c) => c.behavior === "smooth"),
      "open " +
        open +
        " history initialization never requests smooth scrolling",
    );
    check(
      (await page
        .locator(".chat-bubble")
        .evaluateAll(
          (els) => new Set(els.map((el) => el.dataset.messageGroup)).size,
        )) === 120,
      "all history survives open " + open,
    );
    await page.locator(".chat-history").evaluate((el) => {
      el.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -300, bubbles: true }),
      );
      el.scrollTop = 100;
      el.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(120);
    check(
      (await page.locator(".chat-history").evaluate((el) => el.scrollTop)) <
        150,
      "reading history is not pulled back to bottom",
    );
    await page.evaluate(() => (window.entryQA.active = false));
    await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
    await page.locator(".companion-chat").waitFor({ state: "detached" });
    await page.waitForTimeout(100);
  }
  let failedRefreshes = 0;
  const rejectState = async (route) => {
    failedRefreshes++;
    await route.abort("internetdisconnected");
  };
  // A route.fulfill can succeed even in an offline context. Abort explicitly
  // so this assertion exercises the failed-refresh path rather than a mock.
  await page.route("**/chores/companion/state?*", rejectState);
  await context.setOffline(true);
  await ball.click();
  await page.waitForTimeout(900);
  check(
    failedRefreshes > 0 &&
      (await page
        .locator(".chat-bubble")
        .evaluateAll(
          (els) => new Set(els.map((el) => el.dataset.messageGroup)).size,
        )) === 120,
    "cached history remains usable when reopen refresh fails",
  );
  await context.setOffline(false);
  await page.unroute("**/chores/companion/state?*", rejectState);
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await page.locator(".companion-chat").waitFor({ state: "detached" });
  await ball.click();
  await page.waitForFunction(() => window.entryQA.frames.length > 0);
  await page.waitForTimeout(700);
  check(
    (await page.locator(".chat-reply-chunk").count()) === 0,
    "cached assistant history has no character animation replay",
  );
  await page.route("**/chores/companion/chat", async (route) => {
    await route.fulfill({
      json: {
        messages: ["新回复逐渐清晰，历史保持原位。"],
        emotion: "10",
        reminder: null,
      },
    });
  });
  const editor = page.getByLabel("和球球说句话", { exact: true });
  await editor.click();
  await editor.fill("请回答");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.locator(".chat-reply-chunk").first().waitFor();
  check(
    (await page.locator(".chat-reply-chunk").count()) <= 20,
    "new assistant text has a bounded gradual clarity queue",
  );
  await page.waitForTimeout(550);
  check(
    await page
      .locator(".chat-reply-chunk")
      .evaluateAll((nodes) =>
        nodes.every(
          (n) =>
            Number(getComputedStyle(n).opacity) > 0.99 &&
            getComputedStyle(n).filter === "blur(0px)",
        ),
      ),
    "reply text settles fully clear without changing layout",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await editor.fill("减少动态效果");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.waitForTimeout(300);
  check(
    (await page
      .locator(".chat-bubble.assistant")
      .last()
      .locator(".chat-reply-chunk")
      .count()) === 0,
    "reduced-motion replies show text immediately",
  );
  check(errors.length === 0, "no browser errors");
  const out = new URL("../data/tap-arbitration/", import.meta.url);
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(
    new URL(engine + "-entry.json", out),
    JSON.stringify({ engine, checks, physicalDevices: false }, null, 2),
  );
  await page.screenshot({ path: new URL(engine + "-entry.png", out).pathname });
} finally {
  await context.close();
  await browser.close();
  await preview.close();
}

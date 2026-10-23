import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const out = new URL("../data/chat-prompt-bubbles/", import.meta.url);
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
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [],
  checks = [],
  metrics = { engine };
const check = (value, label) => {
  assert(value, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
page.on("pageerror", (e) => errors.push(e.message));
const sample =
  "点击设置进入任务轮序，选择需要调整的任务，然后长按成员整行上下拖动，最后点击保存轮序即可。";
const emoji = "也可以给室友留言👨‍👩‍👧‍👦，先确认收件人👍🏽，再点击发送🇨🇳。";
const rawReply = [sample, emoji];
const account = h.h.db.sqlite
  .prepare("SELECT account_id FROM email_members WHERE user_id=?")
  .get(h.people[0].user_id).account_id;
const insert = h.h.db.sqlite.prepare(
  "INSERT INTO companion_messages(dorm_id,user_id,account_id,request_id,role,body,emotion,created_at) VALUES(?,?,?,?,?,?,?,?)",
);
for (let i = 0; i < 30; i++)
  insert.run(
    h.room.dorm.id,
    h.people[0].user_id,
    account,
    "history-" + i,
    i % 2 ? "assistant" : "user",
    i % 2
      ? JSON.stringify([
          "历史内容要完整保留，请在设置查看已经保存的轮序，确认后再进行调整。",
        ])
      : "这是历史问题第" + i + "条。",
    "02",
    new Date(1700000000000 + i * 1000).toISOString(),
  );
const snapshot = JSON.stringify(
  h.h.db.sqlite.prepare("SELECT * FROM companion_messages ORDER BY id").all(),
);
let sends = 0,
  lastRequest = "",
  stateReads = 0;
page.on("request", (r) => {
  if (r.url().includes("/chores/companion/state?")) stateReads++;
});
await page.route("**/chores/companion/chat", async (route) => {
  sends++;
  const data = route.request().postDataJSON();
  lastRequest = data.request_id;
  const date = new Date().toISOString();
  insert.run(
    h.room.dorm.id,
    h.people[0].user_id,
    account,
    data.request_id,
    "user",
    data.text,
    "02",
    date,
  );
  insert.run(
    h.room.dorm.id,
    h.people[0].user_id,
    account,
    data.request_id,
    "assistant",
    JSON.stringify(rawReply),
    "10",
    date,
  );
  await route.fulfill({
    json: { messages: rawReply, emotion: "10", reminder: null },
  });
});
const chat = () => page.locator('.companion-chat[data-phase="open"]');
const row = () => page.getByTestId("chat-quick-prompts");
const buttons = () => row().locator("button");
const textOf = async () => buttons().allTextContents();
async function open() {
  await page.locator(".companion-identity .dorm-companion").click();
  await chat().waitFor();
  await row().waitFor();
  await page.waitForTimeout(300);
}
async function close() {
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await page.locator(".companion-chat").waitFor({ state: "hidden" });
  await page.waitForTimeout(100);
}
async function rowMetrics() {
  return row().evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    width: el.clientWidth,
    scroll: el.scrollWidth,
    left: el.scrollLeft,
    wrap: getComputedStyle(el).flexWrap,
    scrollbar: getComputedStyle(el).scrollbarWidth,
    tops: [...el.querySelectorAll("button")].map(
      (b) => b.getBoundingClientRect().top,
    ),
  }));
}
async function send(text) {
  const input = page.getByLabel("和球球说句话", { exact: true });
  if ((await input.getAttribute("readonly")) !== null)
    await page.locator(".composer-text").click();
  await input.fill(text);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/chores/companion/chat") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await response;
}
async function groupText(id) {
  return page
    .locator(".chat-bubble.assistant")
    .evaluateAll(
      (els, id) =>
        els
          .filter((el) => el.dataset.messageGroup === id + ":assistant:0")
          .map((el) => el.textContent),
      id,
    );
}
try {
  await page.goto(h.url + "/?start=1");
  await page.locator(".companion-identity .dorm-companion").waitFor();
  await page.waitForTimeout(400);
  await open();
  const first = await textOf(),
    firstGeometry = await rowMetrics();
  check(
    first[0].trim() === "我要留言" && first.length === 3,
    "390px entry shows note first and two sampled existing questions",
  );
  check(
    firstGeometry.wrap === "nowrap" &&
      Math.abs(firstGeometry.height - 44) < 1 &&
      Math.max(...firstGeometry.tops) - Math.min(...firstGeometry.tops) < 1,
    "suggestions occupy one fixed-height row without wrapping",
  );
  check(
    await page.evaluate(() => typeof Intl.Segmenter === "function"),
    "tested engine provides native Unicode grapheme segmentation",
  );
  check(
    await page.locator(".chat-bubble.assistant").evaluateAll((els) => {
      const s = new Intl.Segmenter("zh", { granularity: "grapheme" });
      return els.every((el) => [...s.segment(el.textContent)].length <= 20);
    }),
    "long historical replies already project within 20 graphemes",
  );
  check(
    await page
      .locator(".chat-bubble.assistant")
      .evaluateAll((els) =>
        els.every((el) => !el.querySelector(".chat-reply-chunk")),
      ),
    "historical bubbles render immediately without replaying new-text reveal",
  );
  check(
    JSON.stringify(
      h.h.db.sqlite
        .prepare("SELECT * FROM companion_messages ORDER BY id")
        .all(),
    ) === snapshot,
    "opening long history does not rewrite or multiply persisted rows",
  );
  await page.waitForTimeout(500);
  check(
    JSON.stringify(await textOf()) === JSON.stringify(first),
    "question selection stays stable while the user remains in chat",
  );
  for (const width of [320, 390, 430, 768]) {
    await close();
    await page.setViewportSize({ width, height: 844 });
    await open();
    const a = await textOf(),
      g = await rowMetrics();
    check(
      a[0].trim() === "我要留言" && a.length === (width < 420 ? 3 : 4),
      "width " + width + " keeps note first and the correct sample count",
    );
    check(
      Math.abs(g.height - 44) < 1 &&
        Math.max(...g.tops) - Math.min(...g.tops) < 1,
      "width " + width + " keeps every capsule on the same row",
    );
    if (g.scroll > g.width) {
      await row().evaluate((el) =>
        el.scrollTo({ left: el.scrollWidth, behavior: "instant" }),
      );
      check(
        await row().evaluate((el) => el.scrollLeft > 0),
        "width " +
          width +
          " overflowing questions use native horizontal scroll",
      );
    }
    await page.screenshot({
      path: new URL(engine + "-row-" + width + ".png", out).pathname,
    });
    await close();
    await open();
    const c = await textOf();
    check(
      JSON.stringify(c) !== JSON.stringify(a),
      "width " + width + " reentry changes the ordered selection",
    );
    check(
      (await rowMetrics()).left === 0,
      "width " + width + " reentry restores leftmost note action",
    );
  }
  await close();
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  const persistedBefore = h.h.db.sqlite
    .prepare("SELECT COUNT(*) n FROM companion_messages")
    .get().n;
  await page.evaluate(() => {
    window.replyArrivals = [];
    window.replyPoses = [];
    const host = document.querySelector(".chat-history-content");
    const seen = new Set();
    window.replyObserve = new MutationObserver(() => {
      for (const el of host.querySelectorAll(
        ".chat-bubble.assistant[data-message-id]",
      ))
        if (!seen.has(el.dataset.messageId)) {
          seen.add(el.dataset.messageId);
          window.replyArrivals.push({
            id: el.dataset.messageId,
            t: performance.now(),
            text: el.textContent,
          });
        }
    });
    window.replyObserve.observe(host, { childList: true, subtree: true });
    window.replyRecording = true;
    function frame() {
      if (!window.replyRecording) return;
      for (const el of host.querySelectorAll(
        ".chat-bubble.assistant[data-message-id]",
      )) {
        const s = getComputedStyle(el);
        if (+s.opacity > 0 && +s.opacity < 0.98)
          window.replyPoses.push({
            id: el.dataset.messageId,
            opacity: +s.opacity,
            transform: s.transform,
          });
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  const userText = "这是不能被拆分的用户长问题：" + sample;
  await send(userText);
  await page.waitForFunction(
    (id) =>
      [...document.querySelectorAll(".chat-bubble.assistant")]
        .filter((el) => el.dataset.messageGroup === id + ":assistant:0")
        .map((el) => el.textContent)
        .join("") ===
      "点击设置进入任务轮序，选择需要调整的任务，然后长按成员整行上下拖动，最后点击保存轮序即可。也可以给室友留言👨‍👩‍👧‍👦，先确认收件人👍🏽，再点击发送🇨🇳。",
    lastRequest,
    { timeout: 8000 },
  );
  await page.waitForTimeout(350);
  check(
    sends === 1,
    "one user send produces exactly one model transport request",
  );
  check(
    (await page.locator(".chat-bubble.user").allTextContents()).filter(
      (t) => t === userText,
    ).length === 1,
    "long user message remains a single unchanged bubble",
  );
  const reply = await groupText(lastRequest);
  check(
    reply.join("") === rawReply.join(""),
    "all fresh response characters appear exactly once",
  );
  const arrival = await page.evaluate(
    (id) =>
      window.replyArrivals.filter((e) => e.id.startsWith(id + ":assistant:")),
    lastRequest,
  );
  metrics.arrivals = arrival;
  check(
    arrival.length === reply.length &&
      arrival
        .slice(1)
        .every((e, i) => e.t - arrival[i].t >= 125 && e.t - arrival[i].t < 500),
    "fresh assistant bubbles reveal progressively at a bounded reading pace",
  );
  check(
    (await page.evaluate(() => window.replyPoses)).length > 0,
    "real new bubbles contain visible intermediate opacity/transform frames",
  );
  check(
    await page.locator(".chat-bubble.assistant").evaluateAll((els) => {
      const s = new Intl.Segmenter("zh", { granularity: "grapheme" });
      return els.every((el) => [...s.segment(el.textContent)].length <= 20);
    }),
    "every fresh and historical assistant bubble stays at most 20 graphemes",
  );
  check(
    h.h.db.sqlite.prepare("SELECT COUNT(*) n FROM companion_messages").get()
      .n ===
      persistedBefore + 2,
    "many displayed parts persist as one assistant business record plus one user record",
  );
  check(
    h.h.db.sqlite
      .prepare(
        "SELECT body FROM companion_messages WHERE request_id=? AND role='assistant'",
      )
      .get(lastRequest).body === JSON.stringify(rawReply),
    "raw stored assistant response is unchanged by projection",
  );
  const oldId = lastRequest;
  const beforeReopen = await groupText(oldId);
  await close();
  await open();
  check(
    JSON.stringify(await groupText(oldId)) === JSON.stringify(beforeReopen),
    "reloaded history yields exactly the same split text and order",
  );
  check(
    await page
      .locator(`[data-message-group="${oldId}:assistant:0"]`)
      .evaluateAll((els) =>
        els.every((el) => !el.querySelector(".chat-reply-chunk")),
      ),
    "reopening does not replay historical character reveals",
  );
  await page.locator(".chat-history").evaluate((el) => {
    el.scrollTop = 80;
    el.dispatchEvent(new Event("wheel"));
    el.dispatchEvent(new Event("scroll"));
  });
  const reading = await page
    .locator(".chat-history")
    .evaluate((el) => el.scrollTop);
  await send("继续回答但不要抢走我的历史位置");
  await page.waitForFunction(
    (id) =>
      [...document.querySelectorAll(".chat-bubble.assistant")]
        .filter((el) => el.dataset.messageGroup === id + ":assistant:0")
        .map((el) => el.textContent)
        .join("") ===
      "点击设置进入任务轮序，选择需要调整的任务，然后长按成员整行上下拖动，最后点击保存轮序即可。也可以给室友留言👨‍👩‍👧‍👦，先确认收件人👍🏽，再点击发送🇨🇳。",
    lastRequest,
    { timeout: 8000 },
  );
  check(
    Math.abs(
      (await page.locator(".chat-history").evaluate((el) => el.scrollTop)) -
        reading,
    ) < 3,
    "progressive replies do not pull a history reader down",
  );
  await close();
  await open();
  await buttons().first().click();
  await page.getByTestId("conversation-note").waitFor();
  check(
    sends === 2,
    "note quick action uses existing note workflow without calling AI",
  );
  check(
    !(h.counts.get("POST /chores/notes") || 0),
    "opening/selecting note action never sends a roommate message automatically",
  );
  await page
    .getByTestId("conversation-note")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await row().waitFor();
  if (
    (await page
      .getByLabel("和球球说句话", { exact: true })
      .getAttribute("readonly")) !== null
  )
    await page.locator(".composer-text").click();
  await page.getByLabel("和球球说句话", { exact: true }).focus();
  await page.evaluate(() => {
    const v = visualViewport;
    Object.defineProperty(v, "height", { configurable: true, get: () => 430 });
    v.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(300);
  check(
    (await row().getAttribute("aria-hidden")) === "true",
    "keyboard compact state hides suggestions without replacing their selection",
  );
  await page.evaluate(() => {
    delete visualViewport.height;
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.getByLabel("和球球说句话", { exact: true }).blur();
  await page.waitForTimeout(300);
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await page.screenshot({
      path: new URL(engine + "-" + theme + ".png", out).pathname,
    });
    check(
      await page.getByLabel("和球球说句话", { exact: true }).isVisible(),
      theme + " theme retains the original reachable glass composer",
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("ui-motion-change")),
  );
  await page.getByRole("button", { name: "清空聊天记录", exact: true }).click();
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await page.getByText("我在，想问什么？", { exact: true }).waitFor();
  await page.waitForTimeout(600);
  check(
    h.h.db.sqlite.prepare("SELECT COUNT(*) n FROM companion_messages").get()
      .n === 0,
    "clear still removes raw history once and queued old replies do not reappear",
  );
  check(
    !(await page.locator(".chat-bubble.assistant").allTextContents()).includes(
      sample,
    ),
    "cleared long response cannot resurrect after pending timers",
  );
  check(errors.length === 0, "no Vue or browser runtime errors");
  await page.evaluate(() => {
    window.replyRecording = false;
    window.replyObserve?.disconnect();
  });
  await fs.writeFile(
    new URL(engine + "-result.json", out),
    JSON.stringify(
      {
        engine,
        passed: checks.length,
        checks,
        metrics,
        errors,
        stateReads,
        physicalKeyboard: false,
      },
      null,
      2,
    ),
  );
  console.log(checks.length + " browser checks passed");
} catch (e) {
  await page
    .screenshot({ path: new URL(engine + "-failure.png", out).pathname })
    .catch(() => {});
  await fs.writeFile(
    new URL(engine + "-failure.json", out),
    JSON.stringify(
      {
        error: String(e),
        checks,
        errors,
        body: (await page.locator("body").innerText()).slice(-5000),
        lastRequest,
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await b.close();
  await h.close();
}

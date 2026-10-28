// Actual Vue components + disposable in-memory backend. No production traffic.
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
const dir = new URL("../data/chat-motion-continuity/", import.meta.url);
await fs.mkdir(dir, { recursive: true });
const preview = await createConversationPreview();
let browser, page;
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
const checks = [],
  errors = [],
  metrics = {};
const check = (ok, label) => {
  assert(ok, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(15000);
try {
  await page.goto(
    (native ? `http://10.0.2.2:${preview.port}` : preview.url) + "/?start=1",
  );
  const ball = page.locator(".companion-identity .dorm-companion");
  await ball.waitFor();
  await page.waitForTimeout(650);
  await page.evaluate(() => {
    window.motionFrames = [];
    // The arbiter now consumes the delayed synthetic click. Time the actual
    // accepted pointer release, before Vue opens the predictive surface.
    document.addEventListener(
      "pointerup",
      function observe(e) {
        if (!e.target.closest(".companion-identity .dorm-companion")) return;
        window.motionStart = performance.now();
        const capture = () => {
          const root = document.querySelector(".companion-chat"),
            visual = root?.querySelector(".chat-ball-visual");
          const r = visual?.getBoundingClientRect();
          window.motionFrames.push({
            t: performance.now() - window.motionStart,
            ready: root?.dataset.ready,
            top: r?.top,
            left: r?.left,
            width: r?.width,
            footer: root
              ? Number(
                  getComputedStyle(root.querySelector(".chat-footer")).opacity,
                )
              : 0,
          });
          if (performance.now() - window.motionStart < 720)
            requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
      },
      true,
    );
  });
  await ball.click();
  const chat = page.locator(".companion-chat");
  await chat.waitFor();
  await page.waitForTimeout(800);
  metrics.entry = await page.evaluate(() => window.motionFrames);
  metrics.firstResponse = metrics.entry.find((f) => f.ready === "true")?.t;
  metrics.primaryComplete = metrics.entry.find((f) => f.footer > 0.99)?.t;
  check(
    metrics.firstResponse < 100,
    "first click renders a ready local surface within 100ms, without awaiting AI",
  );
  check(
    metrics.primaryComplete < 500,
    "primary stagger finishes within 500ms on this runner",
  );
  check(
    metrics.entry.filter((f) => f.footer > 0 && f.footer < 0.98).length >= 3,
    "footer has real staggered intermediate frames",
  );
  check(
    new Set(
      metrics.entry.filter((f) => f.width).map((f) => Math.round(f.width)),
    ).size > 4,
    "shared ball travels through intermediate positions and sizes",
  );
  const anchor = await page.locator(".chat-history").evaluate((el) => {
    const first = el.querySelector(".chat-bubble").getBoundingClientRect();
    return Math.abs(
      first.top +
        el.scrollTop -
        el.getBoundingClientRect().top -
        parseFloat(getComputedStyle(el).paddingTop),
    );
  });
  check(
    anchor < 2,
    "initial message retains its content-space anchor when a short viewport needs scrolling",
  );
  const editor = page.getByLabel("和球球说句话", { exact: true });
  await editor.click();
  await editor.fill("保留这份未发送草稿");
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await chat.waitFor({ state: "hidden" });
  await ball.click();
  await chat.waitFor();
  await page.waitForTimeout(600);
  check(
    (await editor.inputValue()) === "保留这份未发送草稿",
    "close and reopen retain unsent text",
  );
  check(
    (await editor.getAttribute("readonly")) !== null,
    "reopen preserves draft without automatically focusing the keyboard",
  );
  check(
    (await page.locator(".chat-loading").count()) === 0,
    "warm reopen keeps history instead of flashing a skeleton over cached messages",
  );
  await editor.click();
  await editor.fill("");
  await page.getByRole("button", { name: "我要留言", exact: true }).click();
  const note = page.getByTestId("conversation-note");
  await note.waitFor();
  await note.evaluate((el) => (window.noteShell = el));
  await page
    .getByRole("group", { name: "留言给谁" })
    .getByRole("button", { name: "张三", exact: true })
    .click();
  await note.getByRole("button", {name:/^继续/}).click();
  await page.waitForTimeout(360);
  check(
    await note.evaluate((el) => el === window.noteShell),
    "recipient to content transition keeps the same confirmation shell DOM",
  );
  await editor.fill("十点回来，帮我留门");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.waitForTimeout(400);
  check(
    (await note.evaluate((el) => el === window.noteShell)) &&
      (await note.getAttribute("data-phase")) === "confirm",
    "content to confirmation projects layout without replacing the card",
  );
  await note.getByRole("button", { name: "修改内容", exact: true }).click();
  await page.waitForTimeout(360);
  check(
    await note.evaluate((el) => el === window.noteShell),
    "editing content crossfades inside the original card",
  );
  await editor.fill("十一点回来");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.waitForTimeout(400);
  const reducedMotion = await page.evaluate(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  await note.evaluate((el) => {
    window.noteExitFrames = [];
    window.noteExitCaptureDone = false;
    const sample = () => {
      if (!el.isConnected) {
        window.noteExitCaptureDone = true;
        return;
      }
      const shell = el.closest(".chat-dock-note");
      if (shell) {
        const rect = shell.getBoundingClientRect();
        window.noteExitFrames.push({
          opacity: Number(getComputedStyle(shell).opacity),
          height: rect.height,
          connected: el.isConnected,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await note.getByRole("button", { name: "取消", exact: true }).click();
  await note.waitFor({ state: "detached" });
  await page.waitForFunction(() => window.noteExitCaptureDone === true);
  const noteExitFrames = await page.evaluate(() => window.noteExitFrames);
  check(
    reducedMotion ||
      noteExitFrames.some(
        (frame) =>
          frame.connected && frame.height > 0 && frame.opacity > 0 && frame.opacity < 1,
      ),
    "cancel keeps the card through visible exit frames when motion is enabled",
  );
  const send = async (text) => {
    await editor.click();
    await editor.fill(text);
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await page.waitForTimeout(1050);
  };
  for (let i = 0; i < 4; i++)
    await send("请介绍一下值日、抬水和日历的使用方法 " + i);
  const history = page.getByTestId("chat-history");
  check(
    await history.evaluate((el) => el.scrollHeight > el.clientHeight + 250),
    "real conversation overflows through both frosted edges",
  );
  const topGlass = await page.evaluate(() => {
    const frost = document.querySelector(".chat-top-frost"),
      history = document.querySelector(".chat-history");
    history.scrollTop = 130;
    history.dispatchEvent(new Event("scroll"));
    return {
      historyTop: history.getBoundingClientRect().top,
      frostBottom: frost.getBoundingClientRect().bottom,
      overlaps: [...history.querySelectorAll(".chat-bubble")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.top < frost.getBoundingClientRect().bottom && r.bottom > 0;
      }),
      blur: [...frost.children].map(
        (el) =>
          getComputedStyle(el).backdropFilter ||
          getComputedStyle(el).webkitBackdropFilter,
      ),
      masks: [...frost.children].every((el) =>
        getComputedStyle(el).maskImage.includes("gradient"),
      ),
    };
  });
  check(
    topGlass.historyTop === 0 &&
      topGlass.overlaps &&
      topGlass.blur.join(",") ===
        "blur(6px),blur(10px),blur(18px),blur(26px)" &&
      topGlass.masks,
    "actual messages extend behind four increasingly blurred top layers, with clear foreground",
  );
  await history.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await send("再说一句");
  // Inspect real scrollTop at successive animation frames immediately after send.
  await editor.fill("这一条用于检查连续滚动");
  await page.evaluate(() => {
    window.scrollFrames = [];
    const el = document.querySelector(".chat-history");
    const start = performance.now();
    const sample = () => {
      window.scrollFrames.push({
        t: performance.now() - start,
        y: el.scrollTop,
        max: el.scrollHeight - el.clientHeight,
      });
      if (performance.now() - start < 900) requestAnimationFrame(sample);
    };
    sample();
  });
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.waitForTimeout(1000);
  metrics.scroll = await page.evaluate(() => window.scrollFrames);
  const scrollStart = metrics.scroll[0],
    scrollEnd = metrics.scroll.at(-1),
    distinctScrollPositions = new Set(
      metrics.scroll.map((frame) => Math.round(frame.y)),
    ),
    reachedLatestMessage =
      scrollEnd && Math.abs(scrollEnd.max - scrollEnd.y) <= 3,
    observedIntermediateScroll =
      scrollStart &&
      scrollEnd &&
      distinctScrollPositions.size > 2 &&
      metrics.scroll.some(
        (frame) =>
          frame.y > scrollStart.y + 2 &&
          frame.y < scrollEnd.y - 2,
      );
  check(
    Boolean(
      reachedLatestMessage &&
        (reducedMotion || observedIntermediateScroll),
    ),
    "new messages retarget through multiple scroll positions rather than jumping to the end",
  );
  await page.route(
    "**/chores/companion/chat",
    async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    },
    { times: 1 },
  );
  await editor.fill("等待回复时向上读");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await history.evaluate((el) => {
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: -80 }));
    el.scrollTop = 40;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(1600);
  check(
    await history.evaluate((el) => Math.abs(el.scrollTop - 40) < 3),
    "touch/wheel interruption prevents a late reply from dragging an older-message reader down",
  );
  for (const width of native ? [] : [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(100);
    check(
      await editor.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      }),
      width + "px input remains inside the viewport",
    );
  }
  if (!native) await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: new URL(engine + "-chat.png", dir).pathname });
  await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await chat.waitFor({ state: "hidden" });
  await page.waitForTimeout(200);
  const box = await ball.boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
  await page.waitForTimeout(750);
  check(
    (await chat.count()) === 0,
    "second tap at the source reverses predictive expansion without activating the new back control",
  );
  check(
    await ball.isVisible(),
    "double tap returns the original animated ball",
  );
  if (!native) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ball.click();
    await chat.waitFor();
    await page.waitForTimeout(120);
    check(
      await page
        .locator(".chat-footer")
        .evaluate(
          (el) =>
            getComputedStyle(el).opacity === "1" &&
            getComputedStyle(el).transform === "none",
        ),
      "reduced motion draws the final entry state directly",
    );
    await page.getByRole("button", { name: "返回宿舍", exact: true }).click();
    await chat.waitFor({ state: "hidden" });
  }
  check(errors.length === 0, "no Vue/browser runtime errors");
  await fs.writeFile(
    new URL(engine + "-result.json", dir),
    JSON.stringify(
      {
        engine,
        status: "passed",
        checks,
        metrics,
        errors,
        limitations: [
          "iPhone physical Safari not connected; Android/Harmony results are recorded separately.",
          "Keyboard geometry in desktop engines does not validate a physical IME.",
          "Optical blur calibration is covered by check-conversation-preview; WebKit runner may omit backdrop-filter in screenshots.",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page
    .screenshot({ path: new URL(engine + "-failure.png", dir).pathname })
    .catch(() => {});
  await fs.writeFile(
    new URL(engine + "-failure.json", dir),
    JSON.stringify({ error: error.message, checks, metrics, errors }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  await preview.close();
}

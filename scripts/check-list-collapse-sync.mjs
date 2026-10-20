// Disposable Vue fixture: no production data or user identity.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
const root = new URL("../", import.meta.url).pathname;
const front = path.join(root, "frontend"),
  name = `collapse-sync-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue");
const evidence = path.join(root, "docs/evidence/collapse-sync");
const safari = process.env.DORM_BROWSER === "webkit";
const checks = [],
  errors = [];
let browser, server;
const check = (condition, label) => {
  assert(condition, label);
  checks.push(label);
};
try {
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import{createApp}from'vue';import{Icon}from'vant';import Root from'./${name}.vue';import'./src/style.css';import'./src/focus.css';createApp(Root).use(Icon).mount('#app')</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import List from'./src/components/CompactRecordList.vue';const records=Array.from({length:8},(_,i)=>({id:i+1,key:'floor',name:'地板',assignee_id:i+1,assignee_name:'室友'+(i+1),marker_id:'pixel-01',completed_at:'2026-10-16T02:00:00Z',completed_date:i<6?'2026-10-16':i===6?'2026-10-15':'2026-10-14'}));</script><template><main style="width:100%;max-width:430px;height:700px;padding:20px;margin:auto;box-sizing:border-box"><List :records="records" today="2026-10-16" month="2026-10"/></main></template>`,
  );
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  server = spawn(
    process.execPath,
    [
      path.join(front, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: front, stdio: "ignore" },
  );
  const url = `http://127.0.0.1:${port}/${name}.html`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await (safari ? webkit : chromium).launch({
    headless: true,
    ...(!safari && process.platform === "darwin"
      ? {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  const heading = page.getByTestId("record-group-2026-10-16");
  const next = page.getByTestId("record-group-2026-10-15");
  await heading.waitFor();
  await page.waitForTimeout(650);
  const initial = await next.evaluate((e) => e.getBoundingClientRect().top);
  await heading.tap();
  const frames = await page.evaluate(async () => {
    const frames = [],
      start = performance.now(),
      group = document.querySelector(
        '[data-testid="record-group-2026-10-16"]',
      ).parentElement;
    while (performance.now() - start < 730) {
      await new Promise(requestAnimationFrame);
      frames.push({
        t: performance.now() - start,
        y: document
          .querySelector('[data-testid="record-group-2026-10-15"]')
          .getBoundingClientRect().top,
        rows: group.querySelectorAll(".record-stagger").length,
        visible: [...group.querySelectorAll(".record-stagger")].some(
          (e) => Number(getComputedStyle(e).opacity) > 0.1,
        ),
        scroll: document.querySelector(".folded-record-page").scrollTop,
      });
    }
    return frames;
  });
  await fs.writeFile(
    path.join(evidence, `${safari ? "webkit" : "chromium"}-frames.json`),
    JSON.stringify(frames),
  );
  check(
    frames.some((f) => f.t < 200 && f.visible && initial - f.y > 20),
    "next date moves up while closing cards are still visible",
  );
  check(
    frames.filter((f) => f.rows > 0 && f.y < initial - 5).length > 4,
    "following dates move over multiple frames during the exit",
  );
  const final = frames.at(-1).y;
  check(
    Math.abs(initial - final) > 200,
    "following date reaches the released layout position",
  );
  check(
    Math.max(
      ...frames.map((f, i) => (i ? Math.abs(f.y - frames[i - 1].y) : 0)),
    ) <
      (initial - final) * 0.3,
    "no end-of-collapse jump in following date position",
  );
  check(
    frames.slice(-8).every((f) => Math.abs(f.y - final) < 1),
    "following dates settle without a second jump",
  );
  check(frames.at(-1).rows === 0, "closing cards are removed after their exit");
  await heading.tap();
  await page.waitForTimeout(100);
  await heading.tap();
  await page.waitForTimeout(90);
  await heading.tap();
  await page.waitForTimeout(700);
  check(
    await page
      .locator(".record-stagger")
      .evaluateAll(
        (els) =>
          els.length === 6 &&
          els.every((e) => getComputedStyle(e).opacity === "1" && !e.style.top),
      ),
    "quick reversal restores every card without stale fixed positions",
  );
  const reversed = await next.evaluate((e) => e.getBoundingClientRect().top);
  check(
    Math.abs(reversed - initial) < 1,
    "quick reversal restores following dates to their original position",
  );
  await heading.tap();
  await page.waitForTimeout(90);
  await next.evaluate((e) => e.click());
  await page.waitForTimeout(700);
  check(
    (await next.getAttribute("aria-expanded")) === "true" &&
      (await page.locator(".record-stagger").count()) === 1,
    "opening a following date during collapse keeps the selected records",
  );
  check(
    await page
      .locator(".record-stack")
      .evaluateAll((els) =>
        els.every(
          (e) => Math.abs(new DOMMatrix(getComputedStyle(e).transform).m42) < 1,
        ),
      ),
    "overlapping changes release every temporary following offset",
  );
  await heading.tap();
  await next.evaluate((e) => e.click());
  await page.waitForTimeout(700);
  check(
    Math.abs(
      (await next.evaluate((e) => e.getBoundingClientRect().top)) - initial,
    ) < 1,
    "opposite changes on adjacent dates restore the correct layout",
  );
  await page
    .locator(".folded-record-page")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  // Scrolling the clicked date heading into view is ordinary browser behavior;
  // measure only the resulting collapse, never carry the old scroll offset.
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await heading.tap();
  await page.waitForTimeout(700);
  check(
    await next.evaluate((e) => {
      const r = e.getBoundingClientRect(),
        p = e.closest(".folded-record-page").getBoundingClientRect();
      return r.top >= p.top - 1 && r.bottom <= p.bottom + 1;
    }),
    "following dates remain reachable after a scrolled collapse",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await heading.tap();
  await page.waitForTimeout(50);
  await heading.tap();
  await page.waitForTimeout(80);
  check(
    (await page.locator(".record-stagger").count()) === 0,
    "reduced motion renders the collapsed final state",
  );
  check(errors.length === 0, "no runtime exceptions");
  await fs.writeFile(
    path.join(evidence, `${safari ? "webkit" : "chromium"}-report.json`),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      status: "passed",
      browser: safari ? "WebKit" : "Chromium",
      checks: checks.length,
    }),
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  await Promise.all([
    fs.rm(html, { force: true }),
    fs.rm(vue, { force: true }),
  ]);
}

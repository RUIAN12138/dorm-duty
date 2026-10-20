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
    `<script setup lang="ts">import {ref} from 'vue';import Calendar from'./src/components/ChoreCalendar.vue';const month=ref('2026-10');const records=Array.from({length:16},(_,i)=>({id:i+1,key:'floor',name:'地板',assignee_id:i+1,assignee_name:'室友'+(i+1),marker_id:'pixel-01',completed_at:'2026-10-16T02:00:00Z',completed_date:i<6?'2026-10-16':'2026-10-'+String(21-i).padStart(2,'0')}));</script><template><main style="width:100%;max-width:430px;height:700px;padding:20px;margin:auto;box-sizing:border-box"><Calendar :records="records" :members="[]" today="2026-10-16" :month="month" @change="month=$event"/></main></template>`,
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
  // The new calendar deliberately uses fixed-height date summaries, with the
  // animated record stack inside a bottom drawer instead of an inline fold.
  await page.getByTestId("calendar-view-list").click();
  await page.waitForTimeout(400);
  const seen = new Set();
  let pages = 0;
  while (true) {
    const labels = await page
      .locator(".record-date")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    labels.forEach((label) => seen.add(label));
    check(labels.length > 0, "each record page contains date summaries");
    check(
      await page.locator(".record-date").evaluateAll((els) =>
        els.every((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }),
      ),
      "every date summary fits in the visible viewport",
    );
    const next = page.getByRole("button", { name: "下一页记录", exact: true });
    pages++;
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click();
  }
  check(
    pages > 1 && seen.size === 11,
    "pagination exposes every date without a scrolling list",
  );
  const previous = page.getByRole("button", {
    name: "上一页记录",
    exact: true,
  });
  while (await previous.isEnabled()) await previous.click();
  const heading = page.getByRole("button", {
    name: "今天，6条记录，查看详情",
    exact: true,
  });
  const initial = await heading.boundingBox();
  await heading.click();
  const detail = page.getByTestId("calendar-day-details");
  await detail.waitFor();
  const layer = page.locator(".sheet-layer");
  check(
    (await layer.getAttribute("data-motion")) === "bottom",
    "date summaries open a bottom drawer",
  );
  const frames = await detail.evaluate(async (el) => {
    const frames = [],
      start = performance.now();
    while (performance.now() - start < 600) {
      await new Promise(requestAnimationFrame);
      frames.push(
        [...el.querySelectorAll(".record-stagger")].map((row) => ({
          opacity: Number(getComputedStyle(row).opacity),
          x: new DOMMatrix(getComputedStyle(row).transform).m41,
        })),
      );
    }
    return frames;
  });
  check(
    frames.some((rows) =>
      rows.some((row) => row.opacity > 0 && row.opacity < 1 && row.x > 0),
    ),
    "record cards fade and travel from the right across intermediate frames",
  );
  check(
    (await detail.locator(".record-stagger").count()) === 6,
    "drawer keeps every record for the selected date",
  );
  check(
    (await detail.locator("img.member-mark").count()) === 0 &&
      (await detail.locator("svg.member-mark").count()) === 6,
    "all six record markers render inline without network images",
  );
  await detail.locator(".record-stagger").last().scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  check(
    (await detail.count()) === 1,
    "closing retains drawer content while the exit runs",
  );
  await detail.waitFor({ state: "detached" });
  const returned = await heading.boundingBox();
  check(
    Math.abs(returned.y - initial.y) < 1,
    "closing a drawer preserves the date summary position",
  );
  await heading.click();
  await detail.waitFor();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await detail.waitFor({ state: "detached" });
  check(
    (await page.locator(".sheet-layer").count()) === 0,
    "repeated open and close leaves no stale drawer",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await heading.click();
  await detail.waitFor();
  await page.waitForTimeout(80);
  check(
    await detail
      .locator(".record-stagger")
      .evaluateAll(
        (els) =>
          els.length === 6 &&
          els.every((el) => getComputedStyle(el).opacity === "1"),
      ),
    "reduced motion shows every record at its final state",
  );
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await detail.waitFor({ state: "detached" });
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

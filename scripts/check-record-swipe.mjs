// Isolated real Vue cells and list gestures. No production identity or writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
const front = new URL("../frontend/", import.meta.url).pathname,
  name = `record-swipe-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue");
const safari = process.env.DORM_BROWSER === "webkit",
  checks = [],
  errors = [];
const check = (condition, label) => {
  assert(condition, label);
  checks.push(label);
};
let browser, server;
try {
  await fs.writeFile(
    html,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import{createApp}from'vue';import{Icon}from'vant';import Root from'./${name}.vue';import'./src/theme.css';import'./src/style.css';import'./src/focus.css';createApp(Root).use(Icon).mount('#app')</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{ref}from'vue';import List from'./src/components/CompactRecordList.vue';import Timeline from'./src/components/RecordTimeline.vue';const records=ref(Array.from({length:14},(_,i)=>({id:i+1,key:i===1?'water':'floor',name:i===1?'抬水':'地板',assignee_id:i<2?1:i+1,assignee_name:i<2?'小林':'室友'+(i+1),marker_id:'pixel-01',completed_at:'2026-10-16T02:00:00Z',completed_date:'2026-10-16'}))),creator=ref(false),busy=ref(false),detail=ref(false),actions=ref([]);(window as any).qa={records,creator,busy,detail,actions};</script><template><main style="height:600px;padding:20px;box-sizing:border-box"><List v-if="!detail" :records="records" today="2026-10-16" month="2026-10" :member-id="1" :undo-ids="[1,2]" editable :creator="creator" :busy="busy" @undo="actions.push('undo:'+ $event)" @edit="actions.push('edit:'+ $event.id)"/><Timeline v-else :records="records.slice(0,1)" :member-id="1" :undo-ids="[1]" editable @undo="actions.push('detail-undo:'+ $event)"/></main></template>`,
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
  await page.getByTestId("calendar-list-record-1").waitFor();
  await page.waitForTimeout(650);
  const first = page.getByTestId("calendar-list-record-1"),
    second = page.getByTestId("calendar-list-record-2");
  const undo = () =>
    first.getByRole("button", { name: "撤销地板打卡", exact: true });
  const open = () =>
    first.getByRole("button", { name: "显示小林的地板记录操作", exact: true });
  const drag = async (cell, dx, dy = 0) => {
    const b = await cell.boundingBox();
    const x = b.x + b.width * 0.6,
      y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  check(
    (await undo().count()) === 0,
    "closed swipe actions are absent from the accessibility tree",
  );
  check(
    (await page
      .getByTestId("calendar-list-record-3")
      .locator(".record-swipe-toggle")
      .count()) === 0,
    "other member rows have no undo or correction actions",
  );
  const firstBox = await first.boundingBox(),
    sx = firstBox.x + firstBox.width * 0.6,
    sy = firstBox.y + firstBox.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 55, sy, { steps: 5 });
  check(
    await first
      .locator(".swipe-record-front")
      .evaluate(
        (el) =>
          Math.abs(new DOMMatrix(getComputedStyle(el).transform).m41 + 55) < 1,
      ),
    "held card follows the finger directly before release",
  );
  await page.mouse.move(sx - 115, sy, { steps: 5 });
  await page.mouse.up();
  const settling = await first
    .locator(".swipe-record-front")
    .evaluate(async (el) => {
      const samples = [],
        start = performance.now();
      while (performance.now() - start < 350) {
        await new Promise(requestAnimationFrame);
        samples.push(new DOMMatrix(getComputedStyle(el).transform).m41);
      }
      return samples;
    });
  check(
    new Set(settling.map((x) => x.toFixed(2))).size > 3 &&
      Math.abs(settling.at(-1) + 128) < 1,
    "release moves through real intermediate transforms into the open anchor",
  );
  check(
    (await undo().count()) === 1,
    "horizontal drag reveals own undo and correction",
  );
  check(
    (await page.evaluate(() => window.qa.actions.value)).length === 0,
    "full swipe never performs an action automatically",
  );
  const evidence = new URL("../docs/evidence/record-swipe/", import.meta.url);
  await fs.mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: new URL(`${safari ? "webkit" : "chromium"}-open-390.png`, evidence)
      .pathname,
  });
  await second
    .getByRole("button", { name: "显示小林的抬水记录操作", exact: true })
    .click();
  await page.waitForTimeout(300);
  check(
    (await first
      .getByRole("button", { name: "撤销地板打卡", exact: true })
      .count()) === 0 &&
      (await page.locator(".swipe-record-cell.is-open").count()) === 1,
    "opening another record closes the first across the list",
  );
  await second.locator(".record-swipe-toggle").focus();
  await page.keyboard.press("Escape");
  check(
    (await second
      .getByRole("button", { name: "显示小林的抬水记录操作", exact: true })
      .getAttribute("aria-expanded")) === "false",
    "Escape closes actions and restores the disclosure control",
  );
  await open().focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(300);
  check(
    (await undo().count()) === 1,
    "keyboard can reveal the same actions without a swipe",
  );
  await first
    .getByRole("button", { name: "修正小林的地板记录", exact: true })
    .click();
  check(
    JSON.stringify(await page.evaluate(() => window.qa.actions.value)) ===
      '["edit:1"]',
    "correction emits exactly once and only after explicit button activation",
  );
  await page.waitForTimeout(520);
  await drag(first, -115);
  await undo().click();
  check(
    JSON.stringify(await page.evaluate(() => window.qa.actions.value)) ===
      '["edit:1","undo:1"]',
    "undo emits once after explicit activation",
  );
  await open().click();
  await page.waitForTimeout(300);
  await page.getByTestId("record-group-2026-10-16").click();
  await page.waitForTimeout(450);
  await page.getByTestId("record-group-2026-10-16").click();
  await page.waitForTimeout(650);
  check(
    (await page.locator(".swipe-record-cell.is-open").count()) === 0,
    "folding and reopening a day does not retain an exposed action rail",
  );
  await drag(first, 0, 70);
  check(
    (await page.locator(".swipe-record-cell.is-open").count()) === 0,
    "vertical pointer movement does not claim a record action",
  );
  if (!safari) {
    const cdp = await page.context().newCDPSession(page),
      box = await first.boundingBox();
    const x = box.x + box.width * 0.6,
      y = box.y + box.height * 0.8;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 12; step++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y - step * 9 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(250);
    check(
      (await page
        .locator(".folded-record-page")
        .evaluate((el) => el.scrollTop > 0)) &&
        (await page.locator(".swipe-record-cell.is-open").count()) === 0,
      "real vertical touch scrolls the list without revealing a record action",
    );
    await page.locator(".folded-record-page").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(100);
  }
  await page.evaluate(() =>
    document.addEventListener(
      "pointerdown",
      (e) => {
        window.qaPointerId = e.pointerId;
      },
      { once: true },
    ),
  );
  const b = await first.boundingBox();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6 - 55, b.y + b.height / 2, {
    steps: 5,
  });
  await first.locator(".swipe-record-front").dispatchEvent("pointercancel", {
    pointerId: 1,
    isPrimary: true,
    bubbles: true,
  });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check(
    (await first
      .getByRole("button", { name: "显示小林的地板记录操作", exact: true })
      .getAttribute("aria-expanded")) === "false",
    "pointer cancellation restores the pre-gesture closed state",
  );
  await open().click();
  await page.waitForTimeout(300);
  await page.locator(".folded-record-page").evaluate((el) => {
    el.scrollTop = 20;
  });
  await page.waitForTimeout(100);
  check(
    (await page.locator(".swipe-record-cell.is-open").count()) === 0 &&
      (await page
        .locator(".folded-record-page")
        .evaluate((el) => el.scrollTop > 0)),
    "native list scrolling closes an open rail without locking the scroll island",
  );
  await page.locator(".folded-record-page").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(80);
  await open().click();
  await page.waitForTimeout(300);
  await page.evaluate(
    () => (window.qa.records.value = [...window.qa.records.value]),
  );
  await page.waitForTimeout(100);
  check(
    (await page.locator(".swipe-record-cell.is-open").count()) === 0,
    "updated record data closes an exposed action rail",
  );
  await page.evaluate(() => (window.qa.creator.value = true));
  await page.waitForTimeout(50);
  check(
    (await page
      .getByTestId("calendar-list-record-3")
      .getByRole("button", { name: "显示室友3的地板记录操作", exact: true })
      .count()) === 1,
    "creator can reveal correction for another member",
  );
  await page
    .getByTestId("calendar-list-record-3")
    .getByRole("button", { name: "显示室友3的地板记录操作", exact: true })
    .click();
  await page.waitForTimeout(300);
  check(
    (await page
      .getByTestId("calendar-list-record-3")
      .getByRole("button", { name: "撤销地板打卡", exact: true })
      .count()) === 0,
    "creator permission does not grant undo of another member",
  );
  await page.evaluate(() => (window.qa.busy.value = true));
  await page.waitForTimeout(100);
  check(
    (await page.locator(".swipe-record-cell.is-open").count()) === 0,
    "busy state releases open actions",
  );
  await page.evaluate(() => (window.qa.busy.value = false));
  await open().click();
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(80);
  check(
    (await page.locator(".swipe-record-cell.is-open").count()) === 0,
    "window blur closes an exposed rail and clears interaction state",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open().click();
  await page.waitForTimeout(50);
  check(
    (await first
      .locator(".swipe-record-front")
      .evaluate((el) => getComputedStyle(el).transitionDuration)) === "0s",
    "reduced motion reveals actions directly",
  );
  await page.evaluate(() => (window.qa.detail.value = true));
  await page.waitForTimeout(80);
  check(
    (await page.locator(".swipe-record-cell").count()) === 0 &&
      (await page
        .getByRole("button", { name: "撤销地板打卡", exact: true })
        .count()) === 1,
    "day-detail timeline keeps its original explicit controls",
  );
  await page.evaluate(() => (window.qa.detail.value = false));
  await page.waitForTimeout(80);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px has no horizontal overflow`,
    );
  }
  check(errors.length === 0, "no browser runtime errors");
  console.log(
    JSON.stringify({
      status: "passed",
      browser: safari ? "WebKit" : "Chromium",
      checks,
    }),
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  await Promise.all([
    fs.rm(html, { force: true }),
    fs.rm(vue, { force: true }),
  ]);
}

// Disposable Vue fixtures: never read device credentials or write a real dorm.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
const root = new URL("../", import.meta.url).pathname,
  front = path.join(root, "frontend"),
  name = `order-boundaries-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue"),
  evidence = path.join(root, "docs/evidence/order-boundaries");
const checks = [],
  errors = [];
let server, browser;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks.push(label);
};
try {
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import {createApp} from 'vue';import {Icon} from 'vant';import Root from './${name}.vue';import './src/style.css';createApp(Root).use(Icon).mount('#app')</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">
import {ref,computed} from 'vue';import Order from './src/components/WaterOrderSheet.vue';import Nudge from './src/components/WaterNudge.vue';
const open=ref(false),count=ref(8),sent=ref(0);const members=computed(()=>Array.from({length:count.value},(_,i)=>({user_id:i+1,nickname:'室友'+(i+1),marker_id:'pixel-'+String(i+1).padStart(2,'0')})));
const categories=computed(()=>['floor','toilet','sink','water'].map((key,i)=>({key,name:['地板','厕所','洗手池','抬水'][i],rotation_order:members.value.map(m=>m.user_id),enabled:true})));
(window as any).qa={open:()=>open.value=true,size:(n:number)=>count.value=n,sent:()=>sent.value};
</script><template><main><button data-testid="open" @click="open=true">轮序</button><h1 style="font-size:64px;text-align:center;margin-top:100px"><Nudge name="室友甲" @tap="sent++"/></h1><Order v-model="open" :members="members" :categories="categories" :category="categories[3]!" :editable="true" :version="1" token="fixture"/></main></template>`,
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
  const safari = process.env.DORM_BROWSER === "webkit";
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
    isMobile: true,
    hasTouch: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  for (const [width, height] of [
    [320, 640],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    for (const total of [8, 24]) {
      await page.evaluate((n) => window.qa.size(n), total);
      await page.getByTestId("open").click();
      await page.waitForTimeout(900);
      await page.locator(".sheet-content").evaluate((e) => (e.scrollTop = 0));
      await page.waitForTimeout(100);
      const geometry = await page.locator(".elastic-sheet").evaluate((el) => {
        const r = (e) => {
          const b = e.getBoundingClientRect();
          return { top: b.top, bottom: b.bottom, right: b.right, left: b.left };
        };
        return {
          panel: r(el),
          scroll: r(el.querySelector(".sheet-content")),
          footer: r(el.querySelector(".sheet-footer")),
          help: r(el.querySelector(".hint-trigger")),
          heading: r(el.querySelector(".sheet-heading")),
        };
      });
      assert(geometry.scroll.bottom <= geometry.footer.top + 1);
      assert(geometry.panel.bottom <= height + 1);
      assert(geometry.panel.right <= width + 1);
      assert(
        geometry.help.top >= geometry.heading.top &&
          geometry.help.bottom <= geometry.heading.bottom,
      );
      checks.push(
        `${width}x${height}/${total}: list clips above separate footer; help stays in title row`,
      );
      check(
        await page.locator(".sort-row .inline-mark path").count(),
        total,
        `${width}/${total}: every member mark is inline and available`,
      );
      await page
        .getByTestId(`order-person-water-${total}`)
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const last = await page
          .getByTestId(`order-person-water-${total}`)
          .boundingBox(),
        footer = await page.locator(".sheet-footer").boundingBox();
      assert(last.y + last.height <= footer.y + 1);
      checks.push(
        `${width}/${total}: last member can be fully scrolled above save button`,
      );
      const painted = await page.locator(".sheet-footer").evaluate((el) => {
        const b = el.getBoundingClientRect();
        return [b.top + 2, b.bottom - 2].every((y) =>
          el.contains(document.elementFromPoint(b.left + b.width / 2, y)),
        );
      });
      check(
        painted,
        true,
        `${width}/${total}: no row paints over or beneath footer`,
      );
      await page.screenshot({
        path: path.join(
          evidence,
          `${safari ? "webkit" : "chromium"}-${width}-${total}.jpg`,
        ),
      });
      await page.getByRole("button", { name: "关闭详情", exact: true }).click();
      await page.locator(".sheet-layer").waitFor({ state: "hidden" });
    }
  }
  await page.getByTestId("open").click();
  await page.waitForTimeout(900);
  const first = await page.getByTestId("order-person-water-1").boundingBox(),
    fourth = await page.getByTestId("order-person-water-4").boundingBox();
  const touch = safari ? null : await page.context().newCDPSession(page);
  const x = first.x + first.width / 2,
    y = first.y + first.height / 2,
    end = fourth.y + fourth.height / 2;
  if (touch) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(280);
    for (let i = 1; i <= 12; i++) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + ((end - y) * i) / 12 }],
      });
      await page.waitForTimeout(12);
    }
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(280);
    await page.mouse.move(x, end, { steps: 12 });
    await page.mouse.up();
  }
  await page.waitForTimeout(450);
  const visual = await page.locator(".sort-person").allTextContents();
  assert(!visual[0].includes("室友1"));
  checks.push(
    touch
      ? "actual browser touch reorders names inside the clipped drawer"
      : "pointer name drag reorders inside the clipped drawer",
  );
  let saved;
  await page.route("**/chores/order", async (route) => {
    saved = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"version":2}',
    });
  });
  await page.getByTestId("water-order-save").click();
  await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  assert(saved.rotation_order.indexOf(1) > 0);
  checks.push("separate footer saves the actual reordered draft");
  await page.getByTestId("open").click();
  await page.getByRole("button", { name: "调整轮序", exact: true }).click();
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  check(
    await page.locator(".sheet-layer").count(),
    1,
    "help dismisses independently of order drawer",
  );
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  await page.getByTestId("water-nudge").click();
  const feedback = await page.getByTestId("water-nudge").evaluate((el) =>
    el
      .getAnimations()
      .map((a) => a.effect.getKeyframes())
      .flat(),
  );
  assert(feedback.some((k) => String(k.transform).includes("0.84")));
  checks.push("nudge uses stronger local elastic deformation");
  check(
    await page.evaluate(() => window.qa.sent()),
    1,
    "one tap emits only one nudge action",
  );
  check(errors, [], "no runtime exceptions");
  await fs.writeFile(
    path.join(evidence, `${safari ? "webkit" : "chromium"}-report.json`),
    JSON.stringify(
      { status: "passed", checks, date: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        status: "passed",
        checks: checks.length,
        browser: safari ? "WebKit" : "Chromium",
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  await Promise.all([
    fs.rm(html, { force: true }),
    fs.rm(vue, { force: true }),
  ]);
}

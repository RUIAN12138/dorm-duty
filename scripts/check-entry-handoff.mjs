// Disposable component fixture, real browser motion; no production dorm access.
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
  name = `handoff-qa-${process.pid}`;
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue"),
  evidence = path.join(root, "docs/evidence/name-handoff");
let server, browser;
const checks = [],
  errors = [];
const check = (a, b, label) => {
  assert.deepEqual(a, b, label);
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
import {ref} from 'vue';import Name from './src/components/WaterHandoffName.vue';import {baselineWaterHandoff} from './src/interaction/waterHandoff';import Order from './src/components/WaterOrderSheet.vue';import Reminder from './src/components/TimedReminderSettings.vue';
const people=[1,2,3].map(id=>({user_id:id,nickname:['小林','小陈','小王'][id-1],marker_id:'pixel-0'+id}));const event=ref<any>(null),target=ref(1),visible=ref(true),open=ref(false),initial=ref('toilet');
const categories=['floor','toilet','sink','water'].map((key,i)=>({key,name:['地板','厕所','洗手池','抬水'][i],enabled:true,rotation_order:[1,2,3]}));baselineWaterHandoff('fixture',null);
(window as any).qa={handoff:(seq:number,to:number)=>{event.value={id:seq,sequence:seq,from_member_id:target.value,completed_at:'2026-10-16T00:00:00Z'};target.value=to},poll:()=>event.value={...event.value},reorder:()=>target.value=3,toggle:()=>visible.value=!visible.value,water:()=>{initial.value='water';open.value=true}};
</script><template><main style="max-width:390px;margin:auto;padding:24px"><h1 style="font-size:64px;text-align:center;margin:80px 0"><Name v-if="visible" scope="fixture" :event="event" :members="people" :target-id="target" :target-name="people[target-1]!.nickname"><button data-testid="real-name" style="font:inherit;background:none;border:0">{{people[target-1]!.nickname}}</button></Name></h1><button data-testid="open" @click="open=true">轮序</button><Order v-model="open" :members="people" :categories="categories" :category="categories[3]!" :initial-key="initial" :current-id="2" :last-water-id="1" editable :version="1" token="fixture"/><Reminder active token="fixture"/></main></template>`,
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
  await page.route("**/chores/reminder-plan", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: false,
        times: ["08:00", "19:00"],
        version: 0,
      }),
    }),
  );
  await page.goto(url);
  check(
    await page.getByTestId("water-name-reel").count(),
    0,
    "entry snaps to real owner, no historical replay",
  );
  const before = await page.getByTestId("water-handoff").boundingBox();
  await page.evaluate(() => window.qa.handoff(1, 2));
  await page.getByTestId("water-name-reel").waitFor();
  await page.waitForTimeout(150);
  await page.evaluate(() => window.qa.poll());
  await page.waitForTimeout(150);
  check(
    await page.getByTestId("water-name-reel").count(),
    1,
    "ordinary board polling does not interrupt a running reel",
  );
  const mid = await page.getByTestId("water-handoff").boundingBox();
  check(
    Math.abs(before.height - mid.height) < 1,
    true,
    "reel never changes hero height",
  );
  const transform1 = await page
    .locator(".handoff-reel")
    .evaluate((e) => getComputedStyle(e).transform);
  await page.waitForTimeout(100);
  const transform2 = await page
    .locator(".handoff-reel")
    .evaluate((e) => getComputedStyle(e).transform);
  check(
    transform1 !== transform2,
    true,
    "names travel continuously between frames",
  );
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-reel.jpg`),
  });
  await page.getByTestId("water-name-reel").waitFor({ state: "hidden" });
  check(
    await page.getByTestId("real-name").textContent(),
    "小陈",
    "reel stops at authoritative next owner",
  );
  await page.evaluate(() => window.qa.toggle());
  await page.evaluate(() => window.qa.toggle());
  await page.waitForTimeout(80);
  check(
    await page.getByTestId("water-name-reel").count(),
    0,
    "tab revisit never replays consumed handoff",
  );
  await page.reload();
  await page.evaluate(() => window.qa.handoff(1, 2));
  await page.waitForTimeout(80);
  check(
    await page.getByTestId("water-name-reel").count(),
    0,
    "reload never replays consumed handoff",
  );
  await page.evaluate(() => window.qa.reorder());
  check(
    await page.getByTestId("water-name-reel").count(),
    0,
    "order change is not a draw",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.qa.handoff(2, 1));
  await page.waitForTimeout(80);
  check(
    await page.getByTestId("water-name-reel").count(),
    0,
    "reduced motion consumes event without rolling",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => window.qa.toggle());
  await page.evaluate(() => window.qa.handoff(3, 2));
  check(
    await page.getByTestId("water-name-reel").count(),
    0,
    "off-page handoff waits until water page is first opened",
  );
  await page.evaluate(() => window.qa.toggle());
  await page.getByTestId("water-name-reel").waitFor();
  checks.push("opening water page consumes the queued new handoff");
  await page.evaluate(() => window.qa.toggle());
  await page.evaluate(() => window.qa.toggle());
  check(
    await page.getByTestId("water-name-reel").count(),
    0,
    "leaving midway never restarts the same draw",
  );
  await page.getByTestId("open").click();
  await page.getByRole("dialog", { name: "厕所轮序" }).waitFor();
  checks.push("order opens at task context instead of always water");
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  await page.evaluate(() => window.qa.water());
  await page.getByRole("dialog", { name: "抬水轮序" }).waitFor();
  check(
    await page.getByTestId("order-person-water-2").textContent(),
    "小陈当前轮到",
    "editable list exposes current water owner",
  );
  await page.getByTestId("order-up-water-3").focus();
  await page.keyboard.press("Enter");
  check(
    await page.getByTestId("order-person-water-3").textContent(),
    "小王保存后轮到",
    "draft previews recalculated pending owner",
  );
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.locator(".sheet-layer").waitFor({ state: "hidden" });
  await page.getByText("定时提醒", { exact: true }).click();
  await page.getByLabel("提醒时间 1", { exact: true }).waitFor();
  check(
    await page.getByLabel("提醒时间 1", { exact: true }).inputValue(),
    "08:00",
    "off reminder still exposes configured time",
  );
  check(
    await page.getByTestId("reminder-plan-enabled").isChecked(),
    false,
    "viewing times never turns reminder on",
  );
  check(errors, [], "no browser runtime errors");
  await fs.writeFile(
    path.join(evidence, `${safari ? "webkit" : "chromium"}-report.json`),
    JSON.stringify({ status: "passed", checks }, null, 2),
  );
  console.log(
    JSON.stringify({
      status: "passed",
      browser: safari ? "WebKit" : "Chromium",
      checks: checks.length,
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

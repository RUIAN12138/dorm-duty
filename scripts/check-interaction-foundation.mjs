import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { chromium } from "../frontend/node_modules/@playwright/test/index.mjs";
const root = new URL("../", import.meta.url).pathname;
const name = `interaction-qa-${process.pid}`;
const front = path.join(root, "frontend");
const html = path.join(front, name + ".html");
const vue = path.join(front, name + ".vue");
const evidence = path.join(root, "docs/evidence/interaction-foundation");
const errors = [],
  checks = [];
let browser, service;
const eq = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks.push(label);
};
async function reserve() {
  const server = net.createServer();
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
try {
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><body><div id="app"></div><script type="module">import {createApp} from 'vue';import {Icon} from 'vant';import Root from './${name}.vue';import {router} from './${name}.vue';import './src/style.css';import './src/focus.css';import 'vant/es/dialog/style/index.mjs';createApp(Root).use(router).use(Icon).mount('#app')</script></body></html>`,
  );
  await fs.writeFile(
    vue,
    `<script lang="ts">import {createRouter,createMemoryHistory} from 'vue-router';export const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});</script>
<script setup lang="ts">
import {ref,computed} from 'vue';import {useRoute} from 'vue-router';import {TabsRoot,TabsContent} from 'reka-ui';
import Nav from './src/components/ChoreBottomNav.vue';import Segments from './src/components/ElasticSegments.vue';import Sheet from './src/components/ElasticSheet.vue';import Sort from './src/components/SortableMembers.vue';import {confirmInSheet} from './src/interactions/confirm';import {installNativeBack} from './src/interactions/nativeBack';
installNativeBack();
window.addEventListener('keydown',()=>document.documentElement.dataset.interaction='keyboard');window.addEventListener('pointerdown',()=>document.documentElement.dataset.interaction='pointer');
const route=useRoute();const section=computed(()=>route.path==='/water'?'water':route.path==='/calendar'?'calendar':'duty');
const view=ref('calendar'),open=ref(false),nested=ref(false),mode=ref<'bottom'|'shared'>('bottom'),origin=ref<DOMRect|null>(null),closed=ref(0),draft=ref('保留输入');
const make=(n:number)=>Array.from({length:n},(_,i)=>({user_id:i+1,nickname:'室友'+(i+1),marker_id:'pixel-01',role:'member',rotation_order:i}));
const members=ref(make(6)),order=ref([1,2,3,4,5,6]),disabled=ref(false),active=ref(true),mounted=ref(true);
const confirmed=ref(0);
function show(event:MouseEvent){origin.value=(event.currentTarget as HTMLElement).getBoundingClientRect();open.value=true;}
async function confirm(){try{await confirmInSheet({title:'确认操作',message:'确认后仍保留抽屉'});confirmed.value++;}catch{}}
(window as any).qa={open:()=>open.value=true,close:()=>open.value=false,mode:(v:any)=>mode.value=v,order:()=>[...order.value],view:()=>view.value,route:()=>route.path,closed:()=>closed.value,confirmed:()=>confirmed.value,long:()=>{members.value=make(24);order.value=members.value.map(m=>m.user_id)},reset:()=>{members.value=make(6);order.value=[1,2,3,4,5,6]},disable:()=>disabled.value=true,enable:()=>disabled.value=false,active:(value:boolean)=>active.value=value,mounted:(value:boolean)=>mounted.value=value};
</script>
<template><main style="padding:24px;min-height:1600px"><h1>交互验证</h1><p data-testid="identity">室友一 · 身份保留</p><button data-testid="open" @click="show">打开面板</button><TabsRoot v-model="view"><Segments v-model="view" group-label="完成记录显示方式" :options="[{value:'calendar',label:'日历',testId:'segment-calendar'},{value:'list',label:'列表',testId:'segment-list'}]"/><TabsContent value="calendar">月历</TabsContent><TabsContent value="list">完成列表</TabsContent></TabsRoot>
<Nav :section="section"/><Sheet v-model="open" title="排序设置" :motion="mode" :origin="origin" @closed="closed++"><label>内容<input data-testid="input" v-model="draft"/></label><Sort v-if="mounted" v-model="order" :members="members" :active="open && active" :disabled="disabled"/><button data-testid="nested" @click="nested=true">打开嵌套</button><button data-testid="confirm" @click="confirm">确认操作</button><Sheet v-model="nested" title="嵌套面板"><button data-testid="inner-button">内部操作</button></Sheet></Sheet></main></template>`,
  );
  const port = await reserve();
  service = spawn(
    process.execPath,
    [
      path.join(front, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: front, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  service.stdout.on("data", (d) => (output += d));
  service.stderr.on("data", (d) => (output += d));
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin + "/" + name + ".html");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error(output);
  }
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.BROWSER_EXECUTABLE ||
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : undefined),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/" + name + ".html");
  await page.getByTestId("nav-duty").waitFor();
  const waitOpen = () =>
    page.waitForFunction(
      () =>
        document.querySelector(".sheet-layer")?.getAttribute("data-phase") ===
        "open",
    );
  const waitClosed = () =>
    page.waitForFunction(() => !document.querySelector(".sheet-layer"));
  const order = () => page.evaluate(() => window.qa.order());
  const drag = async (from, to, cancel = false) => {
    const a = await page.getByTestId("order-drag-water-" + from).boundingBox();
    const b = await page.getByTestId("order-drag-water-" + to).boundingBox();
    assert(a && b);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(280);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(350);
  };
  // A rapid sequence must resolve to the most recent route and preserve identity.
  for (let i = 0; i < 20; i++) {
    const key = ["water", "calendar", "duty"][i % 3];
    await page.getByTestId("nav-" + key).click({ delay: 0 });
  }
  eq(
    await page.evaluate(() => window.qa.route()),
    "/calendar",
    "20 rapid taps keep latest route",
  );
  await page.waitForTimeout(450);
  const indicator = await page.locator(".nav-selection").boundingBox(),
    target = await page.getByTestId("nav-calendar").boundingBox();
  assert(
    Math.abs(indicator.x - target.x) < 2,
    JSON.stringify({
      indicator,
      target,
      style: await page.locator(".nav-selection").getAttribute("style"),
      errors,
    }),
  );
  checks.push("navigation indicator settles at current link");
  eq(
    await page.getByTestId("identity").textContent(),
    "室友一 · 身份保留",
    "navigation preserves identity",
  );

  await page.getByTestId("nav-duty").click();
  await page.waitForTimeout(450);
  const navStart = await page.getByTestId("nav-duty").boundingBox(),
    navEnd = await page.getByTestId("nav-calendar").boundingBox();
  assert(navStart && navEnd);
  await page.mouse.move(navStart.x + navStart.width / 2, navStart.y + 25);
  await page.mouse.down();
  await page.mouse.move(navEnd.x + navEnd.width / 2, navEnd.y + 25, {
    steps: 6,
  });
  eq(
    await page.evaluate(() => window.qa.route()),
    "/",
    "navigation drag previews without changing route",
  );
  await page
    .locator("nav")
    .dispatchEvent("pointercancel", { pointerId: 1, isPrimary: true });
  await page.mouse.up();
  await page.waitForTimeout(450);
  eq(
    await page.evaluate(() => window.qa.route()),
    "/",
    "navigation cancellation preserves route",
  );
  const cancelledNav = await page.locator(".nav-selection").boundingBox();
  assert(Math.abs(cancelledNav.x - navStart.x) < 2);
  checks.push("cancelled navigation settles back");

  await page.getByTestId("segment-list").click();
  eq(
    await page.evaluate(() => window.qa.view()),
    "list",
    "same-page selector updates",
  );
  eq(
    await page.getByTestId("segment-list").getAttribute("role"),
    "tab",
    "selector keeps tab semantics",
  );
  await page.getByTestId("segment-calendar").focus();
  await page.keyboard.press("Enter");
  eq(
    await page.evaluate(() => window.qa.view()),
    "calendar",
    "keyboard selects tab",
  );
  await page.getByTestId("open").click();
  await waitOpen();
  await page.getByTestId("input").fill("保存前的输入");
  const box = await page.locator(".elastic-sheet").boundingBox();
  assert(Math.abs(box.y + box.height - 844) < 2);
  checks.push("bottom sheet ends at viewport bottom");
  await drag(1, 6);
  eq((await order()).at(-1), 1, "first member moves to last");
  await drag(1, 2);
  eq((await order())[0], 1, "same member reverses to first");
  const before = await order();
  await drag(1, 6, true);
  eq(await order(), before, "Escape restores cancelled order");
  eq(
    await page.locator(".sheet-layer").count(),
    1,
    "Escape sorting does not close sheet",
  );
  await page.getByTestId("order-down-water-1").focus();
  await page.keyboard.press("Enter");
  eq((await order())[1], 1, "accessible move button works");
  await page.getByTestId("confirm").click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  eq(
    await page.evaluate(() => window.qa.confirmed()),
    1,
    "nested Vant confirmation remains usable",
  );
  await page.getByTestId("nested").click();
  await page.getByTestId("inner-button").waitFor();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(260);
  eq(
    await page.locator(".sheet-layer").count(),
    1,
    "Escape closes only nested sheet",
  );
  await page.evaluate(() => window.DormNativeBack());
  await waitClosed();
  checks.push("native back closes outer sheet");
  await page.getByTestId("open").click();
  await page.waitForTimeout(70);
  await page.evaluate(() => window.qa.close());
  await page.waitForTimeout(50);
  const beforeReverse = await page
    .locator(".elastic-sheet")
    .evaluate((el) => getComputedStyle(el).transform);
  await page.evaluate(() => window.qa.open());
  const afterReverse = await page
    .locator(".elastic-sheet")
    .evaluate((el) => getComputedStyle(el).transform);
  const delta = await page.evaluate(
    ([a, b]) =>
      Math.abs(new DOMMatrixReadOnly(a).m42 - new DOMMatrixReadOnly(b).m42),
    [beforeReverse, afterReverse],
  );
  assert(delta < 45);
  checks.push("opening/closing reversal continues from current position");
  await waitOpen();
  eq(
    await page.getByTestId("input").inputValue(),
    "保存前的输入",
    "interrupted close preserves input",
  );
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await waitClosed();
  eq(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    ),
    "open",
    "closing restores trigger focus",
  );
  eq(
    await page.evaluate(
      () => getComputedStyle(document.body).overflow !== "hidden",
    ),
    true,
    "closing releases scroll lock",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("open").click();
  await waitOpen();
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await waitClosed();
  checks.push("reduced motion opens and closes without stale animation");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByTestId("open").click();
  await waitOpen();
  await page.evaluate(() => window.qa.reset());
  const cdp = await context.newCDPSession(page);
  const nameBox = await page.getByTestId("order-person-water-1").boundingBox();
  const nameTarget = await page
    .getByTestId("order-person-water-4")
    .boundingBox();
  assert(nameBox && nameTarget);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: nameBox.x + 30, y: nameBox.y + 22 }],
  });
  await page.waitForTimeout(280);
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: nameBox.x + 30,
          y: nameBox.y + 22 + ((nameTarget.y - nameBox.y) * i) / 12,
        },
      ],
    });
    await page.waitForTimeout(18);
  }
  eq((await order())[0], 1, "touch preview does not commit before drop");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(400);
  eq((await order()).indexOf(1) > 0, true, "touch long press on name reorders");
  await page.evaluate(() => window.qa.reset());

  // A vertical touch gesture on the name must scroll before a hold is recognised.
  await page.evaluate(() => window.qa.long());
  await page.waitForTimeout(100);
  const sheet = page.locator(".elastic-sheet");
  const scroller = await sheet.boundingBox();
  const personBounds = await page
    .getByTestId("order-person-water-1")
    .boundingBox();
  assert(personBounds && scroller);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: personBounds.x + 30, y: personBounds.y + 25 }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: personBounds.x + 30, y: personBounds.y + 25 - i * 13 },
      ],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(300);
  eq(
    await sheet.evaluate((el) => el.scrollTop > 0),
    true,
    "ordinary vertical name swipe scrolls",
  );
  eq((await order())[0], 1, "scrolling does not reorder");
  await sheet.evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(150);
  const handle = await page.getByTestId("order-drag-water-1").boundingBox();
  assert(handle);
  await page.mouse.move(handle.x + 15, handle.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(280);
  await page.mouse.move(handle.x + 15, scroller.y + scroller.height - 20, {
    steps: 18,
  });
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(
      handle.x + 15,
      scroller.y + scroller.height - 20 + (i % 2),
    );
    await page.waitForTimeout(20);
  }
  eq(
    await sheet.evaluate((el) => el.scrollTop > 20),
    true,
    "edge dragging auto-scrolls real sheet",
  );
  const edgeTop = await sheet.evaluate((el) => el.scrollTop);
  await page.waitForTimeout(300);
  eq(
    await sheet.evaluate((el, top) => el.scrollTop > top + 10, edgeTop),
    true,
    "holding still at edge continues scrolling",
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(300);
  eq((await order())[0], 1, "edge cancellation preserves original order");
  await page.evaluate(() => window.qa.reset());
  await sheet.evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(100);
  const short = await page.getByTestId("order-drag-water-1").boundingBox();
  assert(short);
  await page.mouse.move(short.x + 15, short.y + 20);
  await page.mouse.down();
  await page.mouse.move(short.x + 15, short.y + 45);
  await page.waitForTimeout(280);
  await page.mouse.up();
  eq(
    (await order())[0],
    1,
    "movement before long press does not start sorting",
  );
  await page.evaluate(() => window.qa.disable());
  eq(
    await page.getByTestId("order-drag-water-1").isDisabled(),
    true,
    "saving state disables drag handle",
  );

  await page.evaluate(() => window.qa.enable());
  const beginHold = async () => {
    const h = await page.getByTestId("order-drag-water-1").boundingBox();
    await page.mouse.move(h.x + 15, h.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(280);
  };
  await beginHold();
  await page.locator(".sort-row.lifted").waitFor();
  await page.evaluate(() => window.qa.active(false));
  await page.mouse.up();
  await page.waitForTimeout(300);
  eq(
    await page.locator(".sort-row.lifted").count(),
    0,
    "closing editor cancels active drag",
  );
  eq((await order())[0], 1, "closing editor never commits preview");
  await page.evaluate(() => window.qa.active(true));
  await beginHold();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PointerEvent("pointercancel", { pointerId: 1, isPrimary: true }),
    ),
  );
  await page.mouse.up();
  await page.waitForTimeout(300);
  eq((await order())[0], 1, "system pointercancel preserves draft");
  await beginHold();
  await page.evaluate(() => window.qa.mounted(false));
  await page.mouse.up();
  await page.waitForTimeout(300);
  eq((await order())[0], 1, "unmount cancels drag without commit");
  await page.evaluate(() => window.qa.mounted(true));

  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await waitClosed();
  await page.screenshot({ path: path.join(evidence, "rest.png") });
  eq(errors, [], "no browser runtime exceptions");
  await fs.writeFile(
    path.join(evidence, "report.json"),
    JSON.stringify(
      {
        status: "passed",
        checks,
        browser: "Chromium mobile viewport",
        physicalDevices: "not tested",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { status: "passed", checks: checks.length, items: checks },
      null,
      2,
    ),
  );
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((c) => c.pages());
    await pages[0]
      ?.screenshot({ path: path.join(evidence, "failure.png") })
      .catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  service?.kill("SIGTERM");
  await Promise.all([
    fs.rm(html, { force: true }),
    fs.rm(vue, { force: true }),
  ]);
}

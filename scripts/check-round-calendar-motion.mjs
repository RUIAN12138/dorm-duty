// Disposable UI fixtures only; no user tokens, production tasks or databases.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
const root = new URL("../", import.meta.url).pathname,
  front = path.join(root, "frontend"),
  name = `round-motion-qa-${process.pid}`;
const evidence = path.join(root, "docs/evidence/round-calendar");
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue");
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
    `<html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="app"></div><script type="module">import {createApp} from 'vue';import {Icon} from 'vant';import Root from './${name}.vue';import './src/style.css';createApp(Root).use(Icon).mount('#app')</script></body></html>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">
 import {ref} from 'vue';import Round from './src/components/RoundProgress.vue';import Timeline from './src/components/RecordTimeline.vue';import Calendar from './src/components/ChoreCalendar.vue';import Sort from './src/components/SortableMembers.vue';import TimeWheel from './src/components/TimeWheel.vue';
 const pastOpen=ref(false),todayOpen=ref(true);const order=ref([3,1,2]),deadline=ref("22:00"),epoch=ref(0);
 const today=ref('2026-10-15'),month=ref('2026-10'),active=ref(true);
 const people=[3,1,2].map((id,i)=>({id,user_id:id,nickname:'室友'+id,marker_id:'pixel-01',completed_at:'2026-10-15T0'+i+':00:00Z'}));
 const round=ref({key:'floor',sequence:1,total:4,completed:3,members:[],completions:people});
 const records=people.map(p=>({id:p.id,key:'floor',name:'地板',assignee_id:p.user_id,assignee_name:p.nickname,marker_id:p.marker_id,completed_at:p.completed_at,completed_date:'2026-10-15'}));
 const past=[...records,...records.map(r=>({...r,id:r.id+20}))].map(r=>({...r,id:r.id+10,completed_at:r.completed_at.replace('15T','14T'),completed_date:'2026-10-14'}));
 (window as any).qa={own:()=>{epoch.value++;(window as any).qa.full()},nextDay:()=>{today.value='2026-10-16';todayOpen.value=false},full:()=>{round.value={...round.value,completed:4,completions:[...people,{...people[0]!,id:4,user_id:4,nickname:'室友4',completed_at:'2026-10-15T04:00:00Z'}]}},undo:()=>{round.value={...round.value,completed:3,completions:people}},reopen:async()=>{active.value=false;await new Promise(r=>setTimeout(r,30));active.value=true},deadline:()=>deadline.value,order:()=>order.value,month:()=>month.value};
 </script><template><main style="max-width:430px;padding:24px;margin:auto"><div data-testid="large-round"><Round :round="round" :active="active"/></div><div data-testid="mini-round"><Round :round="round" :active="active" :celebrate="epoch" compact/></div><Calendar v-model:month="month" :month="month" :today="today" :records="[...records,...past]" :neighbors="{'2026-11':[{...records[0],id:99,completed_date:'2026-11-02',completed_at:'2026-11-02T01:00:00Z'}]}" :members="people" @change="month=$event"/><section data-testid="timeline-fixture"><Timeline date="2026-10-15" label="今天" :records="records" :expanded="todayOpen" list @toggle="todayOpen=!todayOpen"/><Timeline date="2026-10-14" label="10月14日" :records="past" :expanded="pastOpen" list @toggle="pastOpen=!pastOpen"/></section><Sort v-model="order" :members="people" :active="true"/><TimeWheel v-model="deadline" test-id="wheel-input"/></main></template>`,
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
    hasTouch: true,
    isMobile: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByTestId("large-round").getByTestId("round-count").waitFor();
  check(
    await page
      .getByTestId("mini-round")
      .getByTestId("round-count")
      .textContent(),
    "3",
    "compact ring starts at final result",
  );
  check(
    await page.getByTestId("mini-round").locator(".round-plus").count(),
    0,
    "compact ring has no entry celebration",
  );
  const rankingHeight = await page
    .locator(".round-ranking")
    .evaluate((e) => e.getBoundingClientRect().height);
  await page.waitForTimeout(120);
  check(
    await page
      .locator(".round-ranking")
      .evaluate((e) => e.getBoundingClientRect().height),
    rankingHeight,
    "all rank rows reserve height before particle impacts",
  );
  await page.evaluate(() => window.qa.reopen());
  const arcSamples = await page
    .locator('[data-testid="large-round"] .round-progress-value')
    .evaluate(async (el) => {
      const values = [];
      for (let i = 0; i < 70; i++) {
        await new Promise(requestAnimationFrame);
        values.push(Number(el.getAttribute("stroke-dashoffset")));
      }
      return values;
    });
  assert(new Set(arcSamples.map((n) => n.toFixed(2))).size > 12);
  checks.push(
    "arc fills continuously over animation frames instead of integer steps",
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="round-count"]').textContent === "3",
  );
  check(
    await page
      .locator(".round-ranking li")
      .evaluateAll((els) => els.map((e) => Number(e.dataset.memberId))),
    [3, 1, 2],
    "ranking uses server completion chronology",
  );
  check(
    await page
      .locator('[data-testid="large-round"] .round-progress-value')
      .evaluate((e) => Number(e.getAttribute("stroke-dashoffset")) > 0),
    true,
    "ring remains open until everyone completes",
  );
  await page.evaluate(() => window.qa.full());
  await page.locator(".round-plus").waitFor();
  check(
    await page.locator(".round-plus").first().innerText(),
    "+1",
    "new completion visibly travels into the ring",
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="round-count"]').textContent === "4",
  );
  check(
    await page
      .locator('[data-testid="large-round"] .round-progress-value')
      .getAttribute("stroke-dashoffset"),
    "0",
    "last completion closes the ring",
  );
  await page
    .getByTestId("large-round")
    .getByTestId("round-progress-ring")
    .screenshot({
      path: path.join(evidence, `${safari ? "webkit" : "chromium"}-ring.jpg`),
    });
  check(
    await page.getByTestId("mini-round").locator(".round-plus").count(),
    0,
    "remote completion updates mini without celebration",
  );
  await page.evaluate(() => window.qa.undo());
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="round-count"]').textContent === "3",
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".round-ranking li").length === 3,
  );
  check(
    await page.locator(".round-ranking li").count(),
    3,
    "undo removes the actual finisher and reopens the ring",
  );
  await page.evaluate(() => window.qa.own());
  await page.getByTestId("mini-round").locator(".round-plus").waitFor();
  checks.push("local completion alone celebrates compact progress");
  await page.waitForTimeout(1400);
  await page.getByTestId("calendar-view-list").click();
  check(
    await page
      .getByTestId("timeline-fixture")
      .getByTestId("record-group-2026-10-15")
      .getAttribute("aria-expanded"),
    "true",
    "today starts expanded",
  );
  check(
    await page
      .getByTestId("timeline-fixture")
      .getByTestId("record-group-2026-10-14")
      .getAttribute("aria-expanded"),
    "false",
    "past day starts as one row",
  );
  await page
    .getByTestId("timeline-fixture")
    .getByTestId("record-group-2026-10-14")
    .click();
  check(
    await page
      .getByTestId("timeline-fixture")
      .getByTestId("record-group-2026-10-14")
      .getAttribute("aria-expanded"),
    "true",
    "past date expands on demand",
  );
  const delays = await page
    .locator(
      "[data-testid=timeline-fixture] #records-2026-10-14 .record-stagger",
    )
    .evaluateAll((els) =>
      els.map((e) =>
        parseFloat(getComputedStyle(e).transitionDelay.split(",")[0]),
      ),
    );
  assert(delays[1] > delays[0] && delays[2] > delays[1]);
  checks.push("record entrances stagger downwards");
  const stack = page.locator(
    "[data-testid=timeline-fixture] #records-2026-10-14",
  );
  check(
    await stack.locator(".timeline-rail").count(),
    0,
    "record cards have no decorative timeline",
  );
  const intermediate = await stack
    .locator(".record-stagger")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).transform));
  assert(intermediate.some((t) => t !== "none"));
  checks.push(
    "real record cards interpolate from stacked depth to separate rows",
  );
  await page.waitForTimeout(850);
  const positions = await stack
    .locator(".record-stagger")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  assert(positions.every((p, i) => i === 0 || p > positions[i - 1] + 70));
  checks.push("expanded cards occupy separate readable rows");
  await page
    .getByTestId("timeline-fixture")
    .getByTestId("record-group-2026-10-14")
    .click();
  await page.waitForTimeout(850);
  check(
    await stack.locator(".record-stagger").count(),
    0,
    "collapsed records remove all hidden interactive rows",
  );
  const depth = await page
    .getByTestId("timeline-fixture")
    .getByTestId("record-group-2026-10-14")
    .locator("..")
    .evaluate((el) => [
      getComputedStyle(el, "::before").content,
      getComputedStyle(el, "::after").content,
    ]);
  assert(depth.every((value) => value !== "none"));
  checks.push(
    "closed day retains two static depth layers without animating height",
  );
  await page
    .getByTestId("timeline-fixture")
    .getByTestId("record-group-2026-10-14")
    .locator("..")
    .screenshot({
      path: path.join(
        evidence,
        `${safari ? "webkit" : "chromium"}-stack-closed.jpg`,
      ),
    });
  await page
    .getByTestId("timeline-fixture")
    .getByTestId("record-group-2026-10-14")
    .click();
  await page.waitForTimeout(850);
  await page
    .getByTestId("timeline-fixture")
    .getByTestId("record-group-2026-10-14")
    .locator("..")
    .screenshot({
      path: path.join(
        evidence,
        `${safari ? "webkit" : "chromium"}-stack-open.jpg`,
      ),
    });
  await page.screenshot({
    path: path.join(evidence, `${safari ? "webkit" : "chromium"}-records.jpg`),
  });
  await page
    .getByTestId("timeline-fixture")
    .getByTestId("record-group-2026-10-14")
    .click();
  await page
    .getByTestId("timeline-fixture")
    .getByTestId("record-group-2026-10-14")
    .click();
  await page.waitForTimeout(350);
  check(
    await page
      .locator("[data-testid=timeline-fixture] #records-2026-10-14")
      .evaluate((e) => e.getBoundingClientRect().height > 100),
    true,
    "rapid collapse reversal opens the same group",
  );
  await page.evaluate(() => window.qa.nextDay());
  check(
    await page
      .getByTestId("timeline-fixture")
      .getByTestId("record-group-2026-10-15")
      .getAttribute("aria-expanded"),
    "false",
    "midnight folds yesterday without reloading the page",
  );
  await page.getByTestId("calendar-view-grid").click();
  await page.locator(".calendar-surface").scrollIntoViewIfNeeded();
  const b = await page.locator(".month-viewport").boundingBox();
  const x = b.x + b.width * 0.7,
    y = b.y + 70;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 90, y, { steps: 8 });
  check(
    await page.evaluate(() => window.qa.month()),
    "2026-10",
    "held month preview has not committed a different month",
  );
  check(
    await page.locator(".month-page-heading strong").allTextContents(),
    ["9月", "10月", "11月"],
    "every sliding month carries its own month label",
  );
  const tones = await page
    .locator(".month-page")
    .evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).backgroundColor),
    );
  assert(tones[0] !== tones[1] && tones[1] !== tones[2]);
  checks.push("adjacent months have subtly distinct surfaces during drag");
  const preview = await page
    .locator('.chore-calendar-grid[data-month="2026-11"]')
    .boundingBox();
  assert(preview.x < b.x + b.width - 60);
  checks.push("next month dates are visible before the finger releases");
  check(
    await page.locator(".chore-calendar-grid:not([inert])").count(),
    1,
    "only current month accepts date taps or keyboard focus",
  );
  await page.screenshot({
    path: path.join(
      evidence,
      `${safari ? "webkit" : "chromium"}-month-held.jpg`,
    ),
  });
  // Follow the SAME November DOM panel across the rebase, not only the label.
  await page.evaluate(() => {
    window.monthFrames = [];
    window.monthFramesDone = new Promise((resolve) => {
      const el = document.querySelector('.month-page[data-month="2026-11"]');
      let start;
      const sample = (time) => {
        start ??= time;
        window.monthFrames.push({
          x: el.getBoundingClientRect().x,
          time,
          heat: el.querySelector('[data-heat="1"]') !== null,
        });
        if (time - start < 650) requestAnimationFrame(sample);
        else resolve();
      };
      sample(performance.now());
    });
  });
  await page.mouse.up();
  await page.evaluate(() => window.monthFramesDone);
  const frames = await page.evaluate(() => window.monthFrames);
  const monthPositions = frames.map((f) => f.x);
  assert(
    new Set(monthPositions.map((x) => x.toFixed(1))).size > 8,
    "release has visible intermediate frames",
  );
  assert(
    Math.abs(monthPositions.at(-1) - b.x) < 2,
    "month settles to viewport edge",
  );
  for (let i = 1; i < frames.length; i++) {
    assert(
      frames[i].x <= frames[i - 1].x + 2,
      "month never teleports backwards during rebase",
    );
    assert(
      Math.abs(frames[i].x - frames[i - 1].x) <
        b.width * 0.23 + (frames[i].time - frames[i - 1].time),
      "no one-frame month replacement",
    );
    assert(frames[i].heat, "preloaded heat cells survive the month commit");
  }
  checks.push(
    "month rebase preserves the same dates and heat cells across every animation frame",
  );
  check(
    await page.evaluate(() => window.qa.month()),
    "2026-11",
    "releasing commits the previewed month",
  );
  await page.getByTestId("order-person-water-3").scrollIntoViewIfNeeded();
  await page.waitForTimeout(280);
  const first = await page.getByTestId("order-person-water-3").boundingBox(),
    last = await page.getByTestId("order-person-water-2").boundingBox();
  await page.mouse.move(first.x + 35, first.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(280);
  check(
    await page.locator(".sort-row.lifted").count(),
    1,
    "long press on the name lifts its whole row",
  );
  await page.mouse.move(last.x + 35, last.y + 25, { steps: 16 });
  await page.mouse.up();
  await page.waitForFunction(() => window.qa.order()[0] !== 3);
  check(
    (await page.evaluate(() => window.qa.order())).at(-1),
    3,
    "name drag reorders and siblings make room",
  );
  await page.getByTestId("wheel-input").scrollIntoViewIfNeeded();
  await page.getByTestId("wheel-input").click();
  await page.getByTestId("time-wheel").waitFor();
  check(
    await page.locator(".van-picker-column").count(),
    2,
    "deadline uses independent hour and minute inertia wheels",
  );
  await page
    .locator(".van-picker-column")
    .nth(0)
    .getByRole("button", { name: "20", exact: true })
    .dispatchEvent("click");
  await page
    .locator(".van-picker-column")
    .nth(1)
    .getByRole("button", { name: "15", exact: true })
    .dispatchEvent("click");
  await page.getByTestId("time-wheel-confirm").click();
  await page.waitForFunction(() => window.qa.deadline() === "20:15");
  check(
    await page.getByTestId("wheel-input").inputValue(),
    "20:15",
    "wheel confirmation updates the same setting value",
  );
  await page.getByTestId("time-wheel").waitFor({ state: "hidden" });
  if (!safari) {
    await page.getByTestId("wheel-input").click();
    await page.getByTestId("time-wheel").waitFor();
    await page.waitForTimeout(300);
    const bounds = await page
      .locator(".van-picker-column")
      .first()
      .boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 6; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + i * 11 }],
      });
      await page.waitForTimeout(15);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(700);
    const position = await page
      .locator(".van-picker-column__wrapper")
      .first()
      .evaluate(
        (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,
      );
    assert(Math.abs(position / 48 - Math.round(position / 48)) < 0.02);
    checks.push("touch wheel decelerates and snaps to an exact time tick");
    await page.getByTestId("time-wheel-confirm").click();
    await page.getByTestId("time-wheel").waitFor({ state: "hidden" });
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.qa.reopen());
  await page.waitForTimeout(50);
  check(
    await page
      .getByTestId("large-round")
      .getByTestId("round-count")
      .innerText(),
    "4",
    "reduced motion immediately shows the final progress",
  );
  check(errors, [], "no runtime exceptions");
  await fs.writeFile(
    path.join(evidence, `${safari ? "webkit" : "chromium"}-report.json`),
    JSON.stringify(
      {
        status: "passed",
        browser: safari ? "WebKit" : "Chromium",
        checks,
        date: new Date().toISOString(),
        limitation:
          "Browser rendering and input checks; physical iPhone frame rate and haptics are not asserted.",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { status: "passed", browser: safari ? "WebKit" : "Chromium", checks },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  await Promise.all([
    fs.rm(html, { force: true }),
    fs.rm(vue, { force: true }),
  ]);
}

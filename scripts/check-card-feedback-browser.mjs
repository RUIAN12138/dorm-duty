// Actual isolated Vue surfaces. No production credentials, messages or records.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const root = new URL("../", import.meta.url).pathname;
const out = path.resolve(
  root,
  process.env.DORM_CARD_EVIDENCE_DIR || "data/card-feedback",
);
await fs.mkdir(out, { recursive: true });
const h = await createConversationPreview();
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "chromium" && process.platform === "darwin"
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
page.setDefaultTimeout(10000);
const checks = [],
  errors = [],
  developmentTransportWarnings = [];
const check = (v, label) => {
  assert(v, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
page.on("pageerror", (e) => {
  // Full-page fixture navigation may close Vite's development HMR socket
  // before its handshake. Retain this tooling diagnostic, not as an app error.
  if (
    e.message === "WebSocket closed without opened." &&
    e.stack?.includes("/@vite/client:")
  ) {
    developmentTransportWarnings.push(e.message);
    return;
  }
  errors.push(e.message);
  console.log("BROWSER ERROR", e.stack);
});
const base = path.join(root, "frontend/node_modules/.dorm-preview-runtime");
const name = "card-feedback-" + process.pid;
const fixture = path.join(base, name + ".vue"),
  entry = path.join(base, name + ".js");
let baseline;
let hasOriginalGeometry = true;
try {
  baseline = JSON.parse(
    await fs.readFile(
      path.join(
        process.env.DORM_CARD_BASELINE_DIR || out,
        engine + "-baseline.json",
      ),
      "utf8",
    ),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  hasOriginalGeometry = false;
  // A fresh clone has no private/local before captures. Still run all real
  // interaction checks, explicitly recording that before/after was not tested.
  baseline = [320, 390, 430].flatMap((viewportWidth) =>
    [
      {
        route: "/?start=1",
        selector: '[data-testid="pane-duty"] .task-title-button',
      },
      {
        route: "/water?start=1&as=1",
        selector: '[data-testid="water-task"] .task-title-button',
      },
      { route: "/calendar?start=1", selector: ".calendar-surface" },
    ].map((item) => ({ ...item, viewportWidth })),
  );
}
async function sample(el) {
  return el.evaluate((e) => {
    const c = getComputedStyle(e);
    return {
      scale: e.style.scale,
      rotate: e.style.rotate,
      translate: e.style.translate,
      transform: e.style.transform,
      state: e.getAttribute("data-card-state"),
      generic: e.hasAttribute("data-press-feedback"),
      computedTransform: c.transform,
    };
  });
}
async function press(el, { x = 0.8, y = 0.2 } = {}) {
  await el.scrollIntoViewIfNeeded();
  const r = await el.boundingBox();
  const p = { x: r.x + r.width * x, y: r.y + r.height * y };
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  return p;
}
async function cancel() {
  await page.evaluate(() =>
    window.dispatchEvent(
      new PointerEvent("pointercancel", {
        pointerId: 1,
        isPrimary: true,
        bubbles: true,
      }),
    ),
  );
  await page.mouse.up();
}
const rest = (el) =>
  el.evaluate(
    (e) =>
      !e.style.scale &&
      !e.style.rotate &&
      !e.style.translate &&
      !e.hasAttribute("data-card-state"),
  );
try {
  // Compare real board/calendar layout against measurements made before edits.
  for (const item of baseline) {
    await page.setViewportSize({ width: item.viewportWidth, height: 844 });
    await page.goto(h.url + item.route);
    await page.locator(item.selector).waitFor();
    await page.waitForTimeout(650);
    const el = page.locator(item.selector);
    const geometry = await el.evaluate((e) => {
      const r = e.getBoundingClientRect(),
        s = getComputedStyle(e);
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        font: s.fontSize,
        lineHeight: s.lineHeight,
        padding: s.padding,
        borderRadius: s.borderRadius,
      };
    });
    if (hasOriginalGeometry) {
      for (const k of ["x", "y", "width", "height"])
        assert(
          Math.abs(item[k] - geometry[k]) < 0.5,
          `${item.viewportWidth} ${item.route} ${k}`,
        );
      for (const k of ["font", "lineHeight", "padding", "borderRadius"])
        assert.equal(geometry[k], item[k]);
    } else {
      assert(
        geometry.width > 0 &&
          geometry.height > 0 &&
          geometry.x >= 0 &&
          geometry.x + geometry.width <= item.viewportWidth + 1,
      );
    }
    check(
      true,
      `${item.viewportWidth}px ${item.route} ${hasOriginalGeometry ? "keeps baseline geometry and typography" : "stays within viewport; original baseline unavailable"}`,
    );
    if (item.viewportWidth === 390) {
      const mode = item.route.startsWith("/water")
        ? "water"
        : item.route.startsWith("/calendar")
          ? "calendar"
          : "duty";
      await page.screenshot({
        path: path.join(out, `${engine}-after-${mode}.png`),
      });
      if (mode !== "calendar") {
        const pos = await press(el);
        await page.waitForTimeout(100);
        const held = await sample(el);
        check(
          Number(held.scale) >= 0.985 &&
            Number(held.scale) < 1 &&
            !held.generic,
          mode + " has one subtle press driver",
        );
        check(
          parseFloat(held.translate.split(" ").at(-1)) > 0 &&
            parseFloat(held.translate.split(" ").at(-1)) < 2,
          mode + " depresses locally without resizing layout",
        );
        await page.screenshot({
          path: path.join(out, `${engine}-pressed-${mode}.png`),
        });
        await page.mouse.move(pos.x, pos.y + 30, { steps: 3 });
        await page.mouse.up();
        await page.waitForTimeout(360);
        if (!(await rest(el)))
          console.log("release diagnostic", await sample(el));
        check(
          await rest(el),
          mode + " yields to drag intent and restores independent channels",
        );
      } else {
        const month = () => page.locator(".month-page:not([inert])");
        const previous = await month().getAttribute("data-month");
        const contact = await press(el, { x: 0.4, y: 0.08 });
        await page.waitForTimeout(60);
        check(
          (await sample(el)).state === "pressed",
          "calendar blank surface responds before a month swipe",
        );
        await page.mouse.move(contact.x + 125, contact.y, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        check(
          (await month().getAttribute("data-month")) !== previous,
          "original month swipe completes after card feedback yields",
        );
        check(
          await rest(el),
          "month swipe leaves no card tilt or depression behind",
        );
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await fs.writeFile(
    fixture,
    `<script setup lang="ts">
import{ref}from'vue';import Joined from'/src/components/JoinedDorms.vue';import Members from'/src/components/SortableMembers.vue';import Timeline from'/src/components/RecordTimeline.vue';
const disabled=ref(false),active=ref(true),order=ref([1,2,3,4]),events=ref([]),show=ref(true);
const people=Array.from({length:4},(_,i)=>({user_id:i+1,nickname:'测试室友'+(i+1),marker_id:'pixel-01'}));
const rooms=[{code:'ABCDEF12',name:'隔离宿舍',memberId:1,nickname:'测试室友1',marker:'pixel-01'}];
const records=[{id:1,key:'floor',name:'地板',assignee_id:1,assignee_name:'测试室友1',marker_id:'pixel-01',completed_at:'2026-10-23T02:00:00Z',completed_date:'2026-10-23'}];
(window as any).cardQA={disabled,active,order,events,show};
</script><template><main class="card-fixture">
<button v-if="show" v-tilt data-testid="composition-probe" class="probe" style="transform:translateX(7px) rotate(3deg)">原有变换</button>
<button v-tilt data-testid="existing-owner" class="probe" style="scale:.97">既有个体属性</button>
<Joined :rooms="rooms" :disabled="disabled" @select="events.push('room')"/>
<Timeline :records="records" date="2026-10-23" today="2026-10-23" month="2026-10" label="今天" :member-id="1" :undo-ids="[1]" editable list expanded :open-record-id="events.includes('open')?1:null" @record-open="(id, open) => { if(open) { if(!events.includes('open')) events.push('open'); } else events.splice(events.indexOf('open'),1); }" @undo="events.push('undo')" @edit="events.push('edit')"/>
<Members v-model="order" :members="people" :active="active" :disabled="disabled" category-key="water"/>
</main></template><style>.card-fixture{padding:20px;box-sizing:border-box;min-height:1300px}.probe{min-height:52px;border-radius:18px;padding:12px;border:1px solid #aaa;font:inherit;margin:8px 0}</style>`,
  );
  // A real entry module lets Vite resolve Vue/Vant rather than a mocked directive.
  await fs.writeFile(
    entry,
    `import{createApp}from'vue';import{Icon}from'vant';import Root from'./${name}.vue';import'/src/theme.css';import'/src/style.css';import'/src/focus.css';import{tilt}from'/src/interactions/tilt';import{installPressFeedback}from'/src/interaction/pressFeedback';import{installInputMode}from'/src/interaction/inputMode';import{installTheme}from'/src/interaction/theme';installTheme();installInputMode();installPressFeedback();createApp(Root).use(Icon).directive('tilt',tilt).mount('#app');`,
  );
  await page.route("**/__cards", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module" src="/node_modules/.dorm-preview-runtime/${name}.js"></script>`,
    }),
  );
  await page.goto(h.url + "/__cards");
  await page.getByTestId("composition-probe").waitFor();
  await page.waitForTimeout(700);
  const probe = page.getByTestId("composition-probe");
  const original = await sample(probe),
    originalBox = await probe.boundingBox();
  await probe.evaluate((el) => {
    window.cardReads = 0;
    el.addEventListener(
      "pointerdown",
      () => {
        window.cardReads = 0;
      },
      { capture: true },
    );
    const original = el.getBoundingClientRect.bind(el);
    el.getBoundingClientRect = () => {
      window.cardReads++;
      return original();
    };
  });
  const p = await press(probe);
  await page.waitForTimeout(90);
  const held = await sample(probe);
  check(
    held.transform === original.transform &&
      held.rotate !== "0deg" &&
      held.rotate !== "",
    "existing translate/rotation transform survives contact tilt",
  );
  const rotations = [];
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(p.x - 3 + i, p.y + 1);
    await page.waitForTimeout(18);
    rotations.push((await sample(probe)).rotate);
  }
  check(
    new Set(rotations).size > 1,
    "small pointer drift changes rotation continuously",
  );
  check(
    (await page.evaluate(() => window.cardReads)) === 1,
    "one geometry read for the complete contact, none per move",
  );
  await page.evaluate(() => {
    window.cardRelease = [];
    const el = document.querySelector('[data-testid="composition-probe"]');
    let n = 0;
    function frame() {
      window.cardRelease.push({
        t: performance.now(),
        y: el.style.translate,
        scale: el.style.scale,
      });
      if (n++ < 36) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await cancel();
  await page.waitForTimeout(450);
  const frames = await page.evaluate(() => window.cardRelease);
  check(
    new Set(frames.map((f) => f.y)).size > 3,
    "release contains visible intermediate spring positions",
  );
  check(
    await rest(probe),
    "release reaches exact rest and clears temporary ownership styles",
  );
  const after = await probe.boundingBox();
  check(
    Math.abs(after.width - originalBox.width) < 0.2 &&
      Math.abs(after.y - originalBox.y) < 0.2,
    "restored probe geometry does not drift",
  );
  check(
    (await sample(probe)).transform === original.transform,
    "original inline transform remains byte-for-byte intact",
  );
  for (let i = 0; i < 5; i++) {
    await press(probe);
    await page.waitForTimeout(15);
    await cancel();
  }
  await page.waitForTimeout(360);
  check(
    await rest(probe),
    "rapid press/release reversals settle without a second jump",
  );
  const owner = page.getByTestId("existing-owner");
  await press(owner);
  await page.waitForTimeout(70);
  check(
    (await sample(owner)).scale === "0.97" && !(await sample(owner)).state,
    "existing independent transform owner is not overwritten",
  );
  await cancel();
  const room = page.locator(".joined-dorms button");
  await press(room);
  await page.waitForTimeout(100);
  check(
    Number((await sample(room)).scale) > 0.985 && !(await sample(room)).generic,
    "joined dorm avoids old CSS/global double scaling",
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("scroll", { bubbles: true })),
  );
  await page.mouse.up();
  await page.waitForTimeout(350);
  check(
    await rest(room),
    "scroll interruption releases feedback without blocking scrolling",
  );
  await page.evaluate(() => (window.cardQA.disabled.value = true));
  await press(room);
  await page.waitForTimeout(90);
  check(await rest(room), "disabled dorm control has no card feedback");
  await page.mouse.up();
  await page.evaluate(() => (window.cardQA.disabled.value = false));
  // Use the actual row's existing side-swipe, without adding a gesture owner.
  const record = page.locator(".record-row").first();
  const rp = await press(record, { x: 0.5, y: 0.5 });
  await page.mouse.move(rp.x - 90, rp.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  check(
    await rest(record),
    "horizontal cell gesture cancels tilt before swipe settles",
  );
  check(
    await page
      .getByRole("button", { name: "撤销地板打卡", exact: true })
      .isVisible(),
    "original swipe undo remains reachable",
  );
  check(
    await page
      .getByRole("button", { name: "修正测试室友1的地板记录", exact: true })
      .isVisible(),
    "original swipe correction remains reachable",
  );
  await page
    .getByRole("button", { name: "修正测试室友1的地板记录", exact: true })
    .click();
  check(
    (await page.evaluate(() => window.cardQA.events.value)).includes("edit"),
    "correction uses the same existing action event",
  );
  // Actual held state and Reorder are retained; inner lift is independent.
  const person = page.getByTestId("order-person-water-1");
  await person.scrollIntoViewIfNeeded();
  const b1 = await person.boundingBox();
  await page.mouse.move(b1.x + b1.width * 0.5, b1.y + b1.height * 0.5);
  await page.mouse.down();
  await page.waitForTimeout(330);
  const card = page
    .locator(".sort-row")
    .filter({ has: person })
    .locator(".sort-card");
  const lifted = await sample(card);
  check(
    lifted.state === "lifted" &&
      parseFloat(lifted.translate.split(" ").at(-1)) < -3,
    "existing long press lifts only the inner member card",
  );
  check(lifted.scale === "1", "member lift adds no second drag scale");
  check(
    Number(await card.evaluate((e) => getComputedStyle(e, "::after").opacity)) >
      0.2,
    "local member shadow appears during the lift",
  );
  await page.screenshot({ path: path.join(out, engine + "-member-lift.png") });
  await page.mouse.move(b1.x + b1.width * 0.5, b1.y + b1.height * 0.5 + 164, {
    steps: 12,
  });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(450);
  check(
    (await page.evaluate(() => window.cardQA.order.value)).indexOf(1) > 0,
    "existing Reorder changes order after drag",
  );
  check(
    await rest(card),
    "drop settles inner lift without leaving a transform behind",
  );
  await page.evaluate(() => (window.cardQA.disabled.value = true));
  await press(person);
  await page.waitForTimeout(340);
  check(await rest(card), "disabled member does not enter held/lifted state");
  await page.mouse.up();
  await page.evaluate(() => (window.cardQA.disabled.value = false));
  for (const theme of ["light", "dark"]) {
    await page.evaluate((v) => {
      document.documentElement.dataset.theme = v;
      document.documentElement.style.colorScheme = v;
    }, theme);
    await press(probe);
    await page.waitForTimeout(60);
    check(
      Number((await sample(probe)).scale) < 1,
      theme + " mode retains restrained press feedback",
    );
    await cancel();
    await page.waitForTimeout(360);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await press(probe);
  await page.waitForTimeout(80);
  check(await rest(probe), "reduced motion skips tilt, depression and scaling");
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await press(probe);
  await page.evaluate(() => {
    document.documentElement.dataset.interaction = "keyboard";
    window.dispatchEvent(new Event("ui-motion-change"));
  });
  check(
    await rest(probe),
    "keyboard-mode change immediately removes transient card motion",
  );
  await page.mouse.up();
  await press(probe);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  check(
    await rest(probe),
    "window blur releases feedback and restores owned properties",
  );
  await page.mouse.up();
  await press(probe);
  await page.evaluate(() => {
    window.removedCard = document.querySelector(
      '[data-testid="composition-probe"]',
    );
    window.cardQA.show.value = false;
  });
  await page.waitForTimeout(60);
  check(
    await page.evaluate(
      () =>
        !window.removedCard.style.scale &&
        !window.removedCard.hasAttribute("data-card-feedback"),
    ),
    "unmount restores styles, flags and active gesture state",
  );
  await page.mouse.up();
  check(
    errors.length === 0,
    "no application runtime errors (dev HMR diagnostics recorded separately)",
  );
  await fs.writeFile(
    path.join(out, engine + "-result.json"),
    JSON.stringify(
      {
        engine,
        passed: checks.length,
        checks,
        errors,
        developmentTransportWarnings,
        originalGeometryCompared: hasOriginalGeometry,
        physicalKeyboard: false,
        scope:
          "isolated Vue and Pointer Events; not physical Safari/WebView/ArkWeb performance acceptance",
      },
      null,
      2,
    ),
  );
  console.log(checks.length + " card browser checks passed");
} catch (e) {
  await page
    .screenshot({ path: path.join(out, engine + "-failure.png") })
    .catch(() => {});
  throw e;
} finally {
  await browser.close();
  await h.close();
  await fs.rm(fixture, { force: true });
  await fs.rm(entry, { force: true });
}

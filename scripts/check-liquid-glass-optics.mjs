// Real Vue targets, disposable fixture, synthetic content only. Browser timings
// measure this desktop runtime; they are not physical-phone frame-rate claims.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const front = path.join(root, "frontend");
const phase = process.env.DORM_GLASS_BASELINE === "1" ? "before" : "after";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const cpuRate = Number(process.env.DORM_CPU_RATE || 1);
const evidence = path.join(
  root,
  "data/liquid-glass",
  `${phase}-${engine}${cpuRate > 1 ? "-cpu" + cpuRate : ""}`,
);
const fixtureDir = path.join(front, "node_modules/.dorm-glass-qa");
const stem = `glass-${phase}-${engine}-${process.pid}`;
const fixture = path.join(fixtureDir, stem + ".vue");
const source =
  phase === "before"
    ? path.join(root, "data/liquid-glass/baseline/src")
    : path.join(front, "src");
const checks = [],
  errors = [],
  measurements = {};
let vite, browser;
const check = (condition, label) => {
  assert(condition, label);
  checks.push(label);
  console.log("PASS " + engine + ": " + label);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pose(page, selector) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return {
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      bg: s.backgroundColor,
      filter: s.backdropFilter || s.webkitBackdropFilter,
      transform: s.transform,
      opacity: s.opacity,
    };
  });
}
async function drag(page, selector, from, to) {
  const b = await page.locator(selector).boundingBox();
  assert(b);
  await page.mouse.move(b.x + b.width * from, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      b.x + b.width * (from + ((to - from) * i) / 12),
      b.y + b.height / 2,
    );
    await sleep(14);
  }
  await page.mouse.up();
}
try {
  await fs.mkdir(evidence, { recursive: true });
  await fs.mkdir(fixtureDir, { recursive: true });
  await fs.writeFile(
    fixture,
    `<script setup lang="ts">
import{ref,computed}from'vue';import{useRoute}from'vue-router';import{TabsRoot}from'reka-ui';
import Nav from'@qa-source/components/ChoreBottomNav.vue';import Composer from'@qa-source/components/CompanionChatComposer.vue';import Banner from'@qa-source/components/ReminderBanner.vue';import Segments from'@qa-source/components/ElasticSegments.vue';import{setThemeMode}from'@qa-source/interaction/theme';
const route=useRoute(),section=computed(()=>route.path==='/calendar'?'calendar':route.path==='/water'?'water':'duty'),mode=ref('calendar'),draft=ref(''),note=ref<any>({id:9001,sender_name:'测试室友',source:'note',body:'这是一条隔离测试消息',created_at:new Date().toISOString()}),opts=[{value:'calendar',label:'日历'},{value:'list',label:'列表'},{value:'stats',label:'卡片'}];
(window as any).glassFixture={theme:setThemeMode,banner:()=>note.value={...note.value,id:(note.value?.id||9001)+1},mode:()=>mode.value};
</script><template><main class="qa-main"><h1>轮到 · 光学验收</h1><div class="qa-pattern" aria-hidden="true"><p v-for="i in 38" :key="i">{{i%2?'今天的任务 · 保持清透':'值日 / 抬水 / 日历'}}</p></div><TabsRoot v-model="mode"><Segments v-model="mode" :options="opts" group-label="日历显示方式" scrub/></TabsRoot><div class="qa-mode">{{mode}}</div><section class="qa-composer"><Composer v-model:draft="draft" :busy="false" :enabled="true"/></section></main><Nav :section="section"/><Banner :note="note" @dismiss="note=null"/></template><style>
body{margin:0}.qa-main{padding:125px 24px 120px;min-height:100dvh;box-sizing:border-box;background:var(--ui-surface);color:var(--ui-ink)}h1{font-size:24px;margin:0 0 24px}.qa-pattern{position:fixed;inset:0;pointer-events:none;opacity:.32;overflow:hidden}.qa-pattern p{font-size:15px;line-height:24px;margin:0 0 7px;white-space:nowrap;transform:rotate(-8deg);letter-spacing:8px}.qa-main>.calendar-view-selector{z-index:1}.qa-mode{position:relative;margin-top:30px}.qa-composer{position:fixed;left:24px;right:24px;top:60%;z-index:3}.chore-bottom-nav{z-index:5}
</style>`,
  );
  const handleFixture = async (req, res) => {
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="app"></div><script type="module">import{createApp}from'vue';import{createRouter,createWebHistory}from'vue-router';import Root from'/node_modules/.dorm-glass-qa/${stem}.vue';import'@qa-source/theme.css';import'@qa-source/screen.css';import'@qa-source/style.css';import'@qa-source/focus.css';import{installTheme}from'@qa-source/interaction/theme';import{installMotionTokens}from'@qa-source/interaction/motion';installTheme();installMotionTokens();createApp(Root).use(createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]})).mount('#app');</script>`;
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml("/index.html", html));
  };
  vite = await createServer({
    root: front,
    // Baseline aliases differ from the app preview. Sharing its dependency
    // cache can cause a Vite reload in a concurrently open preview/test.
    cacheDir: path.join(front, `node_modules/.vite-glass-${phase}-${engine}`),
    resolve: {
      alias: { "@qa-source": source },
      dedupe: ["vue", "vue-router", "motion-v", "reka-ui"],
    },
    plugins: [
      {
        name: "isolated-glass-fixture",
        configureServer(server) {
          server.middlewares.use("/__glass-qa", handleFixture);
        },
      },
    ],
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    logLevel: "error",
  });
  await vite.listen();
  const address = vite.httpServer.address();
  browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium"
      ? {
          args: ["--enable-unsafe-swiftshader"],
          ...(process.platform === "darwin"
            ? {
                executablePath:
                  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              }
            : {}),
        }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  if (engine === "chromium" && cpuRate > 1)
    await (
      await context.newCDPSession(page)
    ).send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${address.port}/__glass-qa`);
  await page.locator(".composer-text").waitFor({ timeout: 15000 });
  await sleep(500);
  const nav = page.getByTestId("chore-bottom-nav");
  const initial = {
    nav: await pose(page, '[data-testid="chore-bottom-nav"]'),
    composer: await pose(page, ".composer-text"),
    banner: await pose(page, ".reminder-banner-card"),
    segment: await pose(page, ".segment-indicator"),
  };
  measurements.geometry = initial;
  check(
    initial.composer.h === 58,
    "composer retains its original 58px occupancy",
  );
  check(
    Math.abs(initial.banner.h - 60) < 0.5,
    "message capsule retains its original 60px occupancy",
  );
  await page.screenshot({ path: path.join(evidence, "light.png") });
  await page.evaluate(() => {
    window.glassTiming = { frames: [], longTasks: [], active: true };
    let last = performance.now();
    const tick = (now) => {
      if (!window.glassTiming.active) return;
      window.glassTiming.frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver((list) =>
        window.glassTiming.longTasks.push(
          ...list.getEntries().map((e) => e.duration),
        ),
      ).observe({ entryTypes: ["longtask"] });
    } catch {}
  });
  const target = await page.getByTestId("nav-duty").boundingBox();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
  );
  await page.mouse.down();
  await sleep(220);
  measurements.held = await page
    .locator(".liquid-nav-optics")
    .evaluate((el) => {
      const gl = el.getContext("webgl"),
        p = gl?.getParameter(gl.CURRENT_PROGRAM);
      return gl && p
        ? {
            zoom: gl.getUniform(p, gl.getUniformLocation(p, "u_zoom")),
            lens: [...gl.getUniform(p, gl.getUniformLocation(p, "u_lens"))],
          }
        : null;
    });
  if (measurements.held) {
    check(
      measurements.held.zoom > 1.05 &&
        measurements.held.lens[3] > initial.nav.h,
      "held lens magnifies sampled content and extends beyond the rail",
    );
  } else {
    check(
      await page.locator(".nav-selection").isVisible(),
      "missing optical capability exposes the CSS navigation fallback",
    );
  }
  await page.mouse.up();
  await sleep(450);
  await drag(page, ".calendar-view-selector", 0.15, 0.85);
  await sleep(320);
  check(
    (await page.evaluate(() => window.glassFixture.mode())) === "stats",
    "calendar scrub still selects the target content",
  );
  await drag(page, ".calendar-view-selector", 0.85, 0.15);
  await sleep(320);
  check(
    (await page.evaluate(() => window.glassFixture.mode())) === "calendar",
    "calendar scrub remains reversible",
  );
  await page.locator(".composer-text").click();
  await page.getByLabel("和球球说句话", { exact: true }).fill("隔离输入测试");
  check(
    await page
      .getByLabel("和球球说句话", { exact: true })
      .evaluate((el) => el.value === "隔离输入测试"),
    "input text remains readable and editable",
  );
  await page.locator("h1").click();
  await page.evaluate(() => window.glassFixture.banner());
  await sleep(350);
  await drag(
    page,
    ".reminder-banner-motion:not(.is-leaving) .reminder-banner-card",
    0.4,
    0.55,
  );
  await sleep(380);
  measurements.timing = await page.evaluate(() => {
    window.glassTiming.active = false;
    const f = window.glassTiming.frames
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    return {
      samples: f.length,
      p50: f[Math.floor(f.length * 0.5)],
      p95: f[Math.floor(f.length * 0.95)],
      max: f.at(-1),
      over32: f.filter((n) => n > 32).length,
      longTasks: window.glassTiming.longTasks,
    };
  });
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
  );
  await page.mouse.down();
  await sleep(220);
  await page.screenshot({ path: path.join(evidence, "held.png") });
  await page.mouse.up();
  await sleep(400);
  await page.evaluate(() => window.glassFixture.theme("dark"));
  await sleep(400);
  await page.screenshot({ path: path.join(evidence, "dark.png") });
  await page.evaluate(() => window.glassFixture.theme("light"));
  await sleep(350);
  const final = await pose(page, ".composer-text");
  check(
    Math.abs(final.w - initial.composer.w) < 0.5 &&
      Math.abs(final.h - initial.composer.h) < 0.5,
    "theme and interaction do not change composer dimensions",
  );
  if (phase === "after") {
    const surfaces = await page.locator(".liquid-glass-surface").count();
    measurements.surfaceCount = surfaces;
    check(
      surfaces >= 3,
      "composer, banner and calendar have bounded background-only optical layers",
    );
    check(
      await page
        .locator(".liquid-glass-surface")
        .evaluateAll((els) =>
          els.every((el) => getComputedStyle(el).pointerEvents === "none"),
        ),
      "decorative optics never capture pointer input",
    );
    // The regression intentionally checks real backdrop styling, not a class name.
    const s = await pose(page, ".composer-text");
    check(
      !/rgb\([^)]*\)$/.test(s.bg) || s.bg.includes("rgba"),
      "composer does not acquire an opaque solid fill",
    );
    const box = await page.locator(".composer-text").boundingBox();
    const glint = page.locator(".composer-optics .liquid-glass-glint");
    const start = await glint.evaluate((el) => getComputedStyle(el).transform);
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.5);
    await sleep(70);
    check(
      (await glint.evaluate((el) => getComputedStyle(el).transform)) !== start,
      "pointer highlight changes a local composited transform, not layout",
    );
    await page.mouse.up();
    await sleep(260);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sleep(250);
  await drag(page, ".calendar-view-selector", 0.15, 0.85);
  await sleep(100);
  check(
    (await page.evaluate(() => window.glassFixture.mode())) === "stats",
    "reduced motion retains usable calendar navigation",
  );
  await page.screenshot({ path: path.join(evidence, "reduced.png") });
  check(errors.length === 0, "no Vue or browser runtime exceptions");
  if (phase === "after") {
    check(
      await page
        .locator(".liquid-glass-surface")
        .evaluateAll((els) =>
          els.every((el) => getComputedStyle(el).pointerEvents === "none"),
        ),
      "optics remain noninteractive under reduced motion",
    );
    await page.locator(".composer-text").evaluate((el) => {
      window.glassIdleWrites = 0;
      window.glassIdleObserver = new MutationObserver(
        (m) => (window.glassIdleWrites += m.length),
      );
      window.glassIdleObserver.observe(
        el.querySelector(".liquid-glass-surface"),
        { attributes: true },
      );
    });
    await sleep(200);
    check(
      (await page.evaluate(() => window.glassIdleWrites)) === 0,
      "settled optical surface has no idle style-write loop",
    );
    await page.evaluate(() => window.glassIdleObserver.disconnect());
    const fallback = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await fallback.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return /^webgl/.test(type) ? null : original.call(this, type, ...args);
      };
    });
    const f = await fallback.newPage();
    f.on("pageerror", (e) => errors.push(e.message));
    await f.goto(`http://127.0.0.1:${address.port}/__glass-qa`);
    await f.locator(".composer-text").waitFor();
    await sleep(350);
    check(
      await f.locator(".nav-selection").isVisible(),
      "no-WebGL context retains the original usable navigation fallback",
    );
    await f.getByTestId("nav-calendar").click();
    check(
      (await f.url()).endsWith("/calendar"),
      "fallback navigation still changes page",
    );
    await f.screenshot({ path: path.join(evidence, "no-webgl.png") });
    if (engine === "chromium") {
      const cdp = await fallback.newCDPSession(f);
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
      });
      await sleep(180);
      check(
        await f.evaluate(
          () => matchMedia("(prefers-reduced-transparency: reduce)").matches,
        ),
        "reduced-transparency preference is actually emulated",
      );
      check(
        await f
          .locator(".liquid-glass-surface")
          .evaluateAll((els) =>
            els.every((el) => getComputedStyle(el).display === "none"),
          ),
        "reduced transparency hides decorative optical layers",
      );
      const fill = await pose(f, ".composer-text");
      check(
        fill.filter === "none" &&
          !fill.bg.includes("/ 0.") &&
          !fill.bg.startsWith("rgba"),
        "reduced transparency has a solid readable input with no blur",
      );
      await f.screenshot({
        path: path.join(evidence, "reduced-transparency.png"),
      });
    }
    await fallback.close();
  }
  measurements.cpuThrottle = cpuRate;
  measurements.userAgent = await page.evaluate(() => navigator.userAgent);
  await fs.writeFile(
    path.join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "passed",
        phase,
        engine,
        checks,
        measurements,
        errors,
        physicalDevice: false,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      phase,
      engine,
      checks: checks.length,
      timing: measurements.timing,
    }),
  );
} catch (e) {
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    path.join(evidence, "failure.json"),
    JSON.stringify(
      { status: "failed", error: e.message, checks, measurements, errors },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser?.close();
  await vite?.close();
  await fs.rm(fixture, { force: true });
}

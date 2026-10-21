// Real Vue surfaces in an isolated browser. No accounts, API or production data.
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
  name = `glass-input-loading-${process.pid}`,
  html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue"),
  evidence = path.join(root, "docs/evidence/glass-input-loading");
const checks = [],
  errors = [],
  coverage = {};
const check = (condition, label) => {
  assert(condition, label);
  checks.push(label);
};
const safari = process.env.DORM_BROWSER === "webkit";
let browser, server;

async function optics(page) {
  return page.locator(".liquid-nav-optics").evaluate((canvas) => {
    const nav = canvas.closest("nav"),
      gl = canvas.getContext("webgl");
    const program = gl && gl.getParameter(gl.CURRENT_PROGRAM);
    if (!gl || !program || !nav.classList.contains("has-optical-glass"))
      return {
        enabled: false,
        contextAvailable: !!gl,
        clipSupported: CSS.supports(
          "clip-path",
          "polygon(evenodd,0% 0%,100% 0%,100% 100%)",
        ),
        fallback: !!nav.querySelector(".nav-selection"),
      };
    const uniform = (name) =>
      gl.getUniform(program, gl.getUniformLocation(program, name));
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      enabled: true,
      lens: [...uniform("u_lens")],
      zoom: uniform("u_zoom"),
      navHeight: nav.getBoundingClientRect().height,
      canvasHeight: canvas.getBoundingClientRect().height,
      renderer: extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    };
  });
}

try {
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    html,
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fff"><div id="app"></div><script type="module">import{createApp}from'vue';import{createRouter,createWebHistory}from'vue-router';import Root from'./${name}.vue';import'./src/theme.css';import'./src/screen.css';import'./src/style.css';import'./src/focus.css';import{installTheme}from'./src/interaction/theme';import{installMotionTokens}from'./src/interaction/motion';installMotionTokens();installTheme();const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});createApp(Root).use(router).mount('#app');</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{computed,ref}from'vue';import{useRoute}from'vue-router';import Stage from'./src/components/ScreenStage.vue';import Nav from'./src/components/ChoreBottomNav.vue';import Skeleton from'./src/components/LoadingSkeleton.vue';import{setThemeMode}from'./src/interaction/theme';const route=useRoute(),variant=ref<'calendar'|'stats'|'rows'|'task'>('calendar'),section=computed(()=>route.path==='/calendar'?'calendar':route.path==='/water'?'water':'duty');(window as any).glassQA={theme:setThemeMode,variant:(value:any)=>variant.value=value};</script><template><Stage signed-in><main class="qa-surfaces"><h1 tabindex="-1" data-testid="blur-input">交互验收</h1><label for="qa-input">邮箱</label><input id="qa-input" type="email" value="sample@example.test"><p data-testid="after-input">{{section}}</p><div class="qa-loading"><Skeleton :variant="variant"/></div></main></Stage><Nav :section="section"/></template><style>.qa-surfaces{padding:24px;min-width:0;overflow:hidden}.qa-surfaces h1{margin:0 0 24px;font-size:28px}.qa-surfaces label{display:block;margin-bottom:12px}.qa-surfaces input{display:block;box-sizing:border-box;width:100%;height:56px;padding:0 16px;border:1px solid var(--ui-border);border-radius:16px;font-size:16px}.qa-surfaces p{margin:20px 0}.qa-loading{height:330px}</style>`,
  );
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
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
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await (safari ? webkit : chromium).launch({
    headless: true,
    ...(!safari
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
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    window.addEventListener(
      "pointerdown",
      (event) => (window.qaPointerId = event.pointerId),
      true,
    ),
  );
  await page.goto(url);
  await page.getByTestId("chore-bottom-nav").waitFor();
  await page.waitForTimeout(500);
  const rest = await optics(page);
  coverage.webgl = rest.enabled;
  if (rest.enabled) {
    coverage.renderer = rest.renderer;
    check(
      rest.canvasHeight > rest.navHeight,
      "WebGL canvas retains room to render beyond the navigation rail",
    );
    const target = await page.getByTestId("nav-duty").boundingBox();
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
    );
    await page.mouse.down();
    const samples = [];
    for (let frame = 0; frame < 16; frame++) {
      await page.waitForTimeout(24);
      samples.push(await optics(page));
    }
    const held = samples.at(-1);
    coverage.held = {
      navigationHeight: held.navHeight,
      restingLensHeight: rest.lens[3],
      heldLensHeight: held.lens[3],
      heldZoom: held.zoom,
      zoomFrames: new Set(samples.map((sample) => sample.zoom.toFixed(4))).size,
    };
    check(
      samples.some((s) => s.lens[3] > s.navHeight + 1) && held.zoom > 1.05,
      "real WebGL uniforms enlarge the held glass beyond rail height and magnify the covered content",
    );
    check(
      new Set(samples.map((s) => s.zoom.toFixed(4))).size > 3,
      "hold feedback has multiple physical intermediate zoom values",
    );
    await page.screenshot({
      path: path.join(
        evidence,
        `${safari ? "webkit" : "chromium"}-held-glass.png`,
      ),
    });
    await page.mouse.up();
    await page.waitForTimeout(650);
    const released = await optics(page);
    check(
      Math.abs(released.zoom - 1) < 0.003 &&
        Math.abs(released.lens[3] - rest.lens[3]) < 1,
      "releasing settles magnification and lens size back to their original values",
    );
    await page.mouse.down();
    await page.waitForTimeout(160);
    await page.getByTestId("chore-bottom-nav").evaluate((nav) =>
      nav.dispatchEvent(
        new PointerEvent("pointercancel", {
          pointerId: window.qaPointerId,
          bubbles: true,
        }),
      ),
    );
    await page.mouse.up();
    await page.waitForTimeout(650);
    check(
      !(await page
        .getByTestId("chore-bottom-nav")
        .evaluate((el) => el.classList.contains("glass-pressed"))) &&
        Math.abs((await optics(page)).zoom - 1) < 0.003,
      "pointer cancellation clears the held state and returns the real lens",
    );
  } else {
    coverage.webglNote =
      "WebGL unavailable: optical assertions skipped; CSS fallback verified separately";
    check(
      !rest.contextAvailable || !rest.clipSupported,
      "optical coverage is skipped only for missing browser capability, not a broken shader",
    );
    check(
      rest.fallback,
      "unavailable WebGL exposes the CSS navigation fallback",
    );
  }
  await page.getByTestId("nav-calendar").click();
  await page.getByTestId("nav-duty").click();
  await page.getByTestId("nav-calendar").click();
  await page.waitForTimeout(650);
  check(
    (await page.getByTestId("nav-calendar").getAttribute("aria-current")) ===
      "page" &&
      !(await page
        .getByTestId("chore-bottom-nav")
        .evaluate((el) => el.classList.contains("glass-pressed"))),
    "rapid navigation preserves the final selected page without a stuck press",
  );

  const input = page.locator("#qa-input");
  const layout = () =>
    input.evaluate((el) => ({
      width: el.offsetWidth,
      height: el.offsetHeight,
      next: document.querySelector('[data-testid="after-input"]').offsetTop,
      scale: parseFloat(getComputedStyle(el).scale) || 1,
      fill: getComputedStyle(el).backgroundColor,
      blur: getComputedStyle(el).backdropFilter,
      shadow: getComputedStyle(el).boxShadow,
    }));
  const initial = await layout();
  await input.click();
  const focusSamples = [];
  for (let frame = 0; frame < 12; frame++) {
    await page.waitForTimeout(24);
    focusSamples.push(await layout());
  }
  const focused = focusSamples.at(-1);
  check(
    focused.scale > 1 &&
      focused.scale < 1.04 &&
      new Set(focusSamples.map((s) => s.scale.toFixed(4))).size > 2,
    "input focus enlarges gently through real intermediate scale frames",
  );
  check(
    focusSamples.every(
      (s) =>
        s.width === initial.width &&
        s.height === initial.height &&
        s.next === initial.next,
    ),
    "input magnification never changes layout occupancy or moves the following content",
  );
  check(
    focused.fill.startsWith("rgba(") &&
      focused.blur !== "none" &&
      focused.shadow !== "none",
    "input surface uses translucent fill, local optical finish and edge highlight",
  );
  await page.getByTestId("blur-input").click();
  await page.waitForTimeout(420);
  check(
    Math.abs((await layout()).scale - 1) < 0.001,
    "input release returns smoothly to its original scale",
  );
  await page.evaluate(() => window.glassQA.theme("dark"));
  await page.waitForTimeout(350);
  check(
    (await layout()).fill !== initial.fill &&
      (await page.locator("html").getAttribute("data-theme")) === "dark",
    "input glass has a distinct dark-mode fill",
  );

  await page.evaluate(() => window.glassQA.variant("calendar"));
  const skeleton = page.getByTestId("loading-skeleton");
  check(
    (await skeleton.getAttribute("aria-busy")) === "true" &&
      (await skeleton.locator(".skeleton-grid .skeleton-block").count()) === 42,
    "calendar loading surface reserves the six-week grid and reports loading accessibly",
  );
  const shimmer = [];
  for (let frame = 0; frame < 10; frame++) {
    await page.waitForTimeout(32);
    shimmer.push(
      await skeleton
        .locator(".skeleton-block")
        .first()
        .evaluate((el) => getComputedStyle(el, "::after").transform),
    );
  }
  check(
    new Set(shimmer).size > 3 && shimmer.some((t) => t !== "none"),
    "skeleton shimmer visibly travels through intermediate transform frames",
  );
  for (const variant of ["rows", "task", "stats"]) {
    await page.evaluate((value) => window.glassQA.variant(value), variant);
    await page.waitForTimeout(40);
    check(
      (await skeleton.evaluate(
        (el, value) => el.classList.contains("skeleton-" + value),
        variant,
      )) && (await skeleton.locator(".skeleton-block").count()) > 0,
      `${variant} loading variant renders a shaped, non-empty placeholder`,
    );
  }
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(80);
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px surfaces and oversized glass do not cause horizontal scrolling`,
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await input.click();
  await page.waitForTimeout(100);
  check(
    Math.abs((await layout()).scale - 1) < 0.001,
    "reduced motion keeps input focus feedback stationary",
  );
  check(
    await skeleton
      .locator(".skeleton-block")
      .first()
      .evaluate(
        (el) =>
          getComputedStyle(el, "::after").display === "none" &&
          getComputedStyle(el, "::after").animationName === "none",
      ),
    "reduced motion replaces shimmer with a static placeholder",
  );
  if (rest.enabled)
    check(
      Math.abs((await optics(page)).zoom - 1) < 0.003,
      "reduced motion leaves optical zoom at its final neutral value",
    );
  await page.screenshot({
    path: path.join(
      evidence,
      `${safari ? "webkit" : "chromium"}-dark-reduced.png`,
    ),
  });

  // Exercise the deliberate no-WebGL path, rather than counting it as optical coverage.
  const fallback = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  fallback.on("pageerror", (e) => errors.push(e.message));
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === "webgl" ? null : original.call(this, kind, ...args);
    };
  });
  await fallback.goto(url);
  await fallback.locator(".nav-selection").waitFor();
  check(
    !(await fallback
      .getByTestId("chore-bottom-nav")
      .evaluate((el) => el.classList.contains("has-optical-glass"))),
    "forced no-WebGL uses the explicit CSS fallback",
  );
  const fallbackTarget = await fallback.getByTestId("nav-water").boundingBox();
  await fallback.mouse.move(
    fallbackTarget.x + fallbackTarget.width / 2,
    fallbackTarget.y + fallbackTarget.height / 2,
  );
  await fallback.mouse.down();
  await fallback.waitForTimeout(150);
  check(
    await fallback
      .getByTestId("chore-bottom-nav")
      .evaluate((el) => el.classList.contains("glass-pressed")),
    "fallback retains a visible, functional held state",
  );
  await fallback.mouse.up();
  await fallback.waitForTimeout(500);
  check(
    (await fallback.getByTestId("nav-water").getAttribute("aria-current")) ===
      "page",
    "fallback still navigates correctly after release",
  );
  await fallback.close();
  check(errors.length === 0, "no browser runtime exceptions");
  const report = {
    status: "passed",
    browser: safari ? "WebKit" : "Chromium",
    checks: checks.length,
    coverage,
    scope:
      "isolated real Vue/router/DOM/WebGL uniforms; no production or physical-device acceptance",
  };
  await fs.writeFile(
    path.join(evidence, `${safari ? "webkit" : "chromium"}-report.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  await Promise.all([
    fs.rm(html, { force: true }),
    fs.rm(vue, { force: true }),
  ]);
}

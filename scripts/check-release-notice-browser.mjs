// Isolated real Vue/Reka UI. Never visits or writes to the production dorm.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
const front = new URL("../frontend/", import.meta.url).pathname;
const name = `release-notice-${process.pid}`,
  version = "20261020-theme-notice-v54";
const html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue");
let server, browser;
const checks = [],
  errors = [];
const check = (value, label) => {
  assert(value, label);
  checks.push(label);
};
try {
  await fs.writeFile(
    html,
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import{createApp}from'vue';import Root from'./${name}.vue';import'./src/theme.css';import'./src/style.css';import'./src/focus.css';createApp(Root).mount('#app');</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{ref}from'vue';import Notice from'./src/components/ReleaseNotice.vue';const ready=ref(false),block=ref(false);(window as any).noticeQA={ready,block};async function update(){throw Error('isolated update failure');}</script><template><main><h1>原页面</h1><input aria-label="保留输入" value="不丢失"><div v-if="block" role="dialog">已有面板</div><Notice :update-ready="ready" :apply-update="update"/></main></template>`,
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
    {
      cwd: front,
      env: { ...process.env, DORM_RELEASE_NAME: version },
      stdio: "ignore",
    },
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
  await page.addInitScript(() => {
    window.noticeFrames = [];
    const observer = new MutationObserver(() => {
      const el = document.querySelector('[data-testid="release-notice"]');
      if (!el || window.noticeSampling) return;
      window.noticeSampling = true;
      const start = performance.now();
      function sample() {
        window.noticeFrames.push({
          opacity: Number(getComputedStyle(el).opacity),
          scale: new DOMMatrix(getComputedStyle(el).transform).a,
        });
        if (el.isConnected && performance.now() - start < 400)
          requestAnimationFrame(sample);
        else window.noticeSampling = false;
      }
      requestAnimationFrame(sample);
    });
    const observe = () =>
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    if (document.documentElement) observe();
    else document.addEventListener("DOMContentLoaded", observe, { once: true });
  });
  await page.goto(url);
  await page.getByTestId("release-notice").waitFor();
  check(
    await page
      .getByTestId("release-notice")
      .getByText("v54", { exact: true })
      .isVisible(),
    "new release has its own version label",
  );
  await page.waitForTimeout(300);
  const frames = await page.evaluate(() => window.noticeFrames);
  check(
    frames.some((f) => f.opacity > 0 && f.opacity < 1 && f.scale !== 1),
    "notice grows with visible intermediate frames",
  );
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  await page.getByTestId("release-notice").waitFor({ state: "detached" });
  check(
    await page.evaluate(
      (v) =>
        JSON.parse(localStorage.getItem("lundao-release-notices-v1")).includes(
          v,
        ),
      version,
    ),
    "only an acknowledged release is persisted",
  );
  await page.reload();
  await page.waitForTimeout(1000);
  check(
    (await page.getByTestId("release-notice").count()) === 0,
    "acknowledged version does not repeat after reload",
  );
  await page.evaluate(() => (window.noticeQA.ready.value = true));
  await page
    .getByRole("heading", { name: "发现新版本", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "更新页面", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(
    await page
      .getByRole("button", { name: "更新页面", exact: true })
      .isEnabled(),
    "failed service-worker update is retryable",
  );
  await page.getByRole("button", { name: "稍后", exact: true }).click();
  await page.waitForTimeout(1000);
  check(
    (await page.getByTestId("release-notice").count()) === 0,
    "deferring an available update does not immediately reopen it",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "lundao-release-notices-v1",
      JSON.stringify(["old-release"]),
    ),
  );
  await page.reload();
  await page.getByTestId("release-notice").waitFor();
  check(
    true,
    "acknowledging a previous version never suppresses a new release",
  );
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  await page.getByTestId("release-notice").waitFor({ state: "detached" });
  await page.evaluate(() => {
    localStorage.removeItem("lundao-release-notices-v1");
    window.noticeQA.block.value = true;
  });
  await page.reload();
  await page.getByLabel("保留输入").focus();
  await page.waitForTimeout(1100);
  check(
    (await page.getByTestId("release-notice").count()) === 0,
    "release prompt never covers a focused input",
  );
  await page.getByLabel("保留输入").blur();
  await page.getByTestId("release-notice").waitFor();
  check(
    (await page.getByLabel("保留输入").inputValue()) === "不丢失",
    "notices preserve the underlying form",
  );
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  await page.getByTestId("release-notice").waitFor({ state: "detached" });
  await page.evaluate(() =>
    localStorage.removeItem("lundao-release-notices-v1"),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.reload();
  await page.getByTestId("release-notice").waitFor();
  const rect = await page.getByTestId("release-notice").boundingBox();
  check(
    rect.x >= 0 && rect.x + rect.width <= 320 && rect.height <= 568 * 0.75 + 1,
    "narrow-screen notice stays within the screen and sheet cap",
  );
  check(
    await page
      .getByTestId("release-notice")
      .evaluate((el) => el.getAnimations().length === 0),
    "reduced motion reaches the final dialog state directly",
  );
  check(errors.length === 0, "no browser runtime errors");
  const evidence = new URL("../docs/evidence/release-notice/", import.meta.url);
  await fs.mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: new URL(`${safari ? "webkit" : "chromium"}-notice.png`, evidence)
      .pathname,
  });
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
  await fs.rm(html, { force: true });
  await fs.rm(vue, { force: true });
}

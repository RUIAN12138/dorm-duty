// Real application components + isolated API. No production writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
const root = new URL("../", import.meta.url).pathname,
  front = path.join(root, "frontend");
const name = `completion-qa-${process.pid}`,
  html = path.join(front, name + ".html"),
  vue = path.join(front, name + ".vue");
const evidence = path.join(root, "docs/evidence/completion-experience"),
  h = await createHarness();
const checks = [],
  errors = [],
  traces = [];
const check = (value, expected, label) => {
  assert.deepEqual(value, expected, label);
  checks.push(label);
};
let capture;
let server,
  browser,
  failUndo = false,
  failComplete = false;
try {
  await fs.mkdir(evidence, { recursive: true });
  const rooms = [];
  for (const solo of [false, true]) {
    const r = await h.request("/guest/create", {
      method: "POST",
      data: {
        name: solo ? "单人轮次验收" : "交互验收宿舍",
        nickname: "小林",
        members: solo ? [] : ["小陈", "小王"],
      },
    });
    assert.equal(r.status, 201);
    rooms.push(await r.json());
  }
  await fs.writeFile(
    html,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import{createApp}from'vue';import{createRouter,createWebHistory}from'vue-router';import{Icon}from'vant';import Root from './${name}.vue';import './src/style.css';import './src/focus.css';import'vant/es/toast/style/index.mjs';import'vant/es/dialog/style/index.mjs';const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});createApp(Root).use(router).use(Icon).mount('#app')</script>`,
  );
  await fs.writeFile(
    vue,
    `<script setup lang="ts">import{computed}from'vue';import{useRoute}from'vue-router';import Board from'./src/components/ChoreBoard.vue';import Nav from'./src/components/ChoreBottomNav.vue';const route=useRoute();const rooms=${JSON.stringify(rooms)};const room=computed(()=>rooms[Number(route.query.room)||0]!);const section=computed(()=>route.query.section==='water'?'water':'duty');</script><template><main class="guest-page" style="max-width:520px;padding:12px 20px 0;margin:auto;background:#fff;min-height:100svh;box-sizing:border-box"><Board :key="room.invite_code" :invite="room.invite_code" dorm-name="交互验收宿舍" :member-id="room.member_id" :token="room.access_token" :demo="false" :section="section"/><Nav :section="section"/></main></template>`,
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
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/" + name + ".html")).ok) break;
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
    ...(process.env.DORM_CAPTURE_VIDEO === "1"
      ? {
          recordVideo: {
            dir: path.join(evidence, "video"),
            size: { width: 390, height: 844 },
          },
        }
      : {}),
  });
  capture = page.video();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/chores/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname.endsWith("/complete") && failComplete) {
      failComplete = false;
      await new Promise((r) => setTimeout(r, 500));
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: { message: "本次打卡未成功" } }),
      });
    }
    if (url.pathname.endsWith("/undo") && failUndo) {
      failUndo = false;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: { message: "稍后重试撤销" } }),
      });
    }
    if (/\/(complete|undo)$/.test(url.pathname))
      await new Promise((r) => setTimeout(r, 100));
    const r = await h.request(url.pathname + url.search, {
      method: req.method(),
      token: req.headers().authorization?.replace("Bearer ", ""),
      ...(req.postData() ? { data: JSON.parse(req.postData()) } : {}),
    });
    await route.fulfill({
      status: r.status,
      contentType: "application/json",
      body: await r.text(),
    });
  });
  async function board(index = 0) {
    const room = rooms[index];
    return (
      await h.request(
        `/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`,
        { token: room.access_token },
      )
    ).json();
  }
  async function frames(duration) {
    return page.evaluate(async (ms) => {
      const rows = [],
        start = performance.now();
      const rect = (s) => {
        const e = document.querySelector(s),
          r = e?.getBoundingClientRect();
        return r ? [r.x, r.y, r.width, r.height] : null;
      };
      while (performance.now() - start < ms) {
        await new Promise(requestAnimationFrame);
        const b = document.querySelector(".completion-surface"),
          caps = b?.querySelectorAll(".completion-cap"),
          cap = caps?.[0],
          a = cap?.getBoundingClientRect(),
          z = caps?.[1]?.getBoundingClientRect(),
          mark = b?.querySelector(".completion-check path"),
          bubble = document.querySelector(".completion-praise-bubble");
        rows.push({
          t: performance.now() - start,
          round: !!b?.classList.contains("is-round"),
          surfaceOpacity: b && Number(getComputedStyle(b).opacity),
          button: rect(".completion-surface"),
          caption: rect(".hero-caption"),
          title: rect(".task-title-stage") || rect(".water-title-stage"),
          titleText:
            rect(".task-title-stage h2") || rect(".water-title-stage h2"),
          selector: rect(".task-selector"),
          nav: rect(".chore-bottom-nav"),
          scrollY,
          shape:
            a && z
              ? Math.max(a.right, z.right) - Math.min(a.left, z.left)
              : null,
          color: cap && getComputedStyle(cap).backgroundColor,
          stroke: mark
            ? Number.parseFloat(getComputedStyle(mark).strokeDashoffset)
            : null,
          particles: document.querySelectorAll(".completion-particles i")
            .length,
          progressArc: Number(
            document
              .querySelector(".board-focus .round-progress-value")
              ?.getAttribute("stroke-dashoffset"),
          ),
          progressPlus: [
            ...document.querySelectorAll(".board-focus .round-plus"),
          ].some((e) => Number(getComputedStyle(e).opacity) > 0.1),
          progressScale:
            document.querySelector(".board-focus .round-ring-visual") &&
            new DOMMatrix(
              getComputedStyle(
                document.querySelector(".board-focus .round-ring-visual"),
              ).transform,
            ).a,
          praiseTransform: bubble && getComputedStyle(bubble).transform,
          praiseScale:
            bubble && new DOMMatrix(getComputedStyle(bubble).transform).a,
          praiseClear: bubble
            ? (() => {
                const r = bubble.getBoundingClientRect();
                return [
                  ...document.querySelectorAll(
                    ".board-focus .completion-surface,.board-focus .round-progress,.board-focus .hero-caption,.board-focus .task-selector,.board-focus .task-title-stage,.board-focus .water-title-stage,.board-focus .water-nudge-actions",
                  ),
                ].every((e) => {
                  const b = e.getBoundingClientRect();
                  return (
                    !b.width ||
                    !b.height ||
                    r.bottom <= b.top + 1 ||
                    r.top >= b.bottom - 1
                  );
                });
              })()
            : true,
          praiseOpacity:
            bubble && Number(getComputedStyle(bubble.parentElement).opacity),
          pendingOpacity:
            b?.querySelector(".pending-label") &&
            Number(getComputedStyle(b.querySelector(".pending-label")).opacity),
        });
      }
      return rows;
    }, duration);
  }
  function stable(rows, label) {
    for (const key of ["caption", "title", "titleText", "selector", "nav"]) {
      const values = rows.map((r) => r[key]).filter(Boolean);
      if (!values.length) continue;
      check(
        [0, 1, 2, 3].every(
          (i) =>
            Math.max(...values.map((v) => v[i])) -
              Math.min(...values.map((v) => v[i])) <
            1,
        ),
        true,
        `${label}: ${key} does not shift or rewrap`,
      );
    }
    check(
      new Set(rows.map((r) => r.scrollY)).size,
      1,
      `${label}: page never scrolls itself`,
    );
  }
  async function completeAndInspect(task, label) {
    const button = page.getByTestId(`complete-${task.key}-${task.id}`);
    await button.waitFor();
    const trace = frames(1500);
    await button.tap();
    const rows = await trace;
    traces.push({ label, rows });
    const moving = rows.filter((r) => r.round && r.shape > 70 && r.shape < 270);
    check(
      moving.length > 1,
      true,
      `${label}: capsule has visible intermediate widths`,
    );
    check(
      rows.some((r) => r.round && r.shape <= 58),
      true,
      `${label}: capsule reaches a real circle`,
    );
    check(
      rows.filter((r) => r.round).every((r) => r.color === "rgb(17, 17, 17)"),
      true,
      `${label}: shrinking surface never flashes grey or disappears`,
    );
    check(
      rows.filter((r) => r.round).every((r) => r.surfaceOpacity > 0.99),
      true,
      `${label}: busy disabled styling never fades the whole button`,
    );
    check(
      rows.some((r) => r.stroke > 0 && r.stroke < 30),
      true,
      `${label}: success check is visibly drawn`,
    );
    check(
      rows.some((r) => r.particles === 8),
      true,
      `${label}: success alone releases local particles`,
    );
    check(
      rows.some((r) => r.praiseTransform && r.praiseScale < 0.99),
      true,
      `${label}: encouragement scales in as a popup`,
    );
    check(
      rows.some((r) => r.praiseOpacity > 0 && r.praiseOpacity < 1),
      true,
      `${label}: encouragement also fades in`,
    );
    check(
      rows.filter((r) => r.praiseOpacity > 0.95).every((r) => r.praiseClear),
      true,
      `${label}: popup never covers task controls`,
    );
    stable(rows, label);
    if (task.key !== "water") {
      check(
        new Set(rows.map((r) => r.progressArc.toFixed(2))).size > 12,
        true,
        `${label}: the actual page ring fills continuously after a server receipt`,
      );
      check(
        rows.some((r) => r.progressPlus),
        true,
        `${label}: a visible +1 reaches the actual page ring`,
      );
      check(
        rows.some(
          (r) => r.progressScale && Math.abs(r.progressScale - 1) > 0.005,
        ),
        true,
        `${label}: only the ring absorbs with a local elastic deformation`,
      );
    }
    return rows;
  }
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(origin + "/" + name + ".html");
    await page.getByTestId("pane-duty").waitFor();
    await page.waitForTimeout(400);
    const b = await board();
    const task = b.today_tasks.find((t) => t.key === "floor");
    check(
      await page.getByTestId("round-progress").getByRole("progressbar").count(),
      1,
      `${width}px actual duty page has the circular progress component`,
    );
    check(
      await page.getByTestId("round-progress").locator(".round-plus").count(),
      0,
      `${width}px initial page never replays old completions`,
    );
    await completeAndInspect(task, `${width}px duty`);
    await page.screenshot({
      path: path.join(
        evidence,
        `${safari ? "webkit" : "chromium"}-${width}-praise.png`,
      ),
    });
    if (width === 390) {
      await page.getByTestId("round-progress").tap();
      const details = page.getByTestId("round-members");
      await details.waitFor();
      check(
        await details
          .locator(".round-progress-ring, .round-progress-display")
          .count(),
        1,
        "the real round drawer restores its full ring instead of a horizontal bar",
      );
      const detailFrames = await details.evaluate(async (el) => {
        const samples = [],
          start = performance.now();
        while (performance.now() - start < 1400) {
          await new Promise(requestAnimationFrame);
          const row = el.querySelector(".round-ranking li");
          samples.push({
            arc: Number(
              el
                .querySelector(".round-progress-value")
                .getAttribute("stroke-dashoffset"),
            ),
            plus: [...el.querySelectorAll(".round-plus")].some(
              (e) => Number(getComputedStyle(e).opacity) > 0.1,
            ),
            rankOpacity: row && Number(getComputedStyle(row).opacity),
            rankX: row && new DOMMatrix(getComputedStyle(row).transform).m41,
          });
        }
        return samples;
      });
      traces.push({ label: "real round drawer", rows: detailFrames });
      check(
        new Set(detailFrames.map((r) => r.arc.toFixed(2))).size > 12,
        true,
        "expanded ring visibly accumulates with continuous intermediate arc values",
      );
      check(
        detailFrames.some((r) => r.plus),
        true,
        "expanded ring visibly absorbs +1",
      );
      check(
        detailFrames.some(
          (r) => r.rankOpacity > 0 && r.rankOpacity < 1 && r.rankX > 0,
        ),
        true,
        "completed names independently fade and slide in from the right",
      );
      check(
        await details.locator(".round-ranking li").count(),
        1,
        "expanded ranking lists actual finishers only",
      );
      check(
        await details
          .locator("progress,[data-testid=sortable-members]")
          .count(),
        0,
        "round completion details contain neither the replacement bar nor sorting controls",
      );
      await details.screenshot({
        path: path.join(
          evidence,
          `${safari ? "webkit" : "chromium"}-restored-round.png`,
        ),
      });
      await page.getByRole("button", { name: "关闭详情" }).tap();
      await details.waitFor({ state: "hidden" });
      check(
        await page.getByTestId("round-progress").locator(".round-plus").count(),
        0,
        "closing round details never replays the compact ring",
      );
    }
    const undo = page.getByTestId(`undo-${task.id}`);
    await undo.waitFor();
    const reversing = frames(650);
    await undo.tap();
    const rows = await reversing;
    traces.push({ label: `${width}px undo`, rows });
    check(
      rows.every((r) => !r.round && r.particles === 0),
      true,
      `${width}px undo never contracts or celebrates`,
    );
    check(
      rows.every((r) => !r.progressPlus),
      true,
      `${width}px undo never sends +1 into the ring`,
    );
    check(
      rows.some((r) => r.pendingOpacity > 0 && r.pendingOpacity < 1),
      true,
      `${width}px undo crossfades smoothly back to the pending label`,
    );
    stable(rows, `${width}px undo`);
    check(
      (await board()).today_tasks.find((t) => t.id === task.id).status,
      "pending",
      `${width}px undo restores server state`,
    );
  }
  const early = (await board()).today_tasks.find((t) => t.key === "floor");
  await page.getByTestId(`complete-floor-${early.id}`).tap();
  await page.locator(".completion-check").waitFor();
  const interrupted = frames(650);
  await page.getByTestId(`undo-${early.id}`).tap();
  const interruptedRows = await interrupted;
  check(
    interruptedRows
      .filter((r) => r.t > 120)
      .every((r) => !r.round && r.particles === 0),
    true,
    "undo during the check expands immediately and cancels the old particles",
  );
  check(
    (await board()).today_tasks.find((t) => t.id === early.id).status,
    "pending",
    "early undo keeps the real task pending",
  );
  const retry = (await board()).today_tasks.find((t) => t.key === "floor");
  failComplete = true;
  await page.getByTestId(`complete-floor-${retry.id}`).tap();
  await page.waitForTimeout(350);
  check(
    await page.locator(".completion-check,.completion-particles").count(),
    0,
    "recompletion never celebrates an old receipt while the new request is pending",
  );
  await page.getByRole("alert").getByText("本次打卡未成功").waitFor();
  check(
    await page.locator(".completion-surface.is-round").count(),
    0,
    "failed recompletion restores the pending capsule",
  );
  // Complete every category at the narrowest viewport: reserve icon space and
  // verify all three task choices stay on the same track.
  await page.setViewportSize({ width: 320, height: 568 });
  for (const task of (await board()).today_tasks) {
    await page
      .locator(".task-selector button")
      .filter({ hasText: task.name })
      .tap();
    await page.waitForTimeout(240);
    await completeAndInspect(task, `320px ${task.key} cumulative checks`);
  }
  const done = (await board()).undo_tasks.filter((t) => t.key !== "water");
  await page
    .locator(".task-selector button")
    .filter({ hasText: done[0].name })
    .tap();
  await page.waitForTimeout(240);
  failUndo = true;
  await page.getByTestId(`undo-${done[0].id}`).tap();
  await page.getByRole("alert").getByText("稍后重试撤销").waitFor();
  check(
    await page.locator(".completion-surface.is-round").count(),
    0,
    "failed undo never enters the completion morph",
  );
  check(
    await page.getByTestId(`undo-${done[0].id}`).isEnabled(),
    true,
    "failed undo keeps the completed action retryable",
  );
  // Single-member rounds immediately advance in the API. The current animation
  // must finish before its task is replaced by the next live round.
  await page.goto(origin + "/" + name + ".html?room=1");
  await page.getByTestId("pane-duty").waitFor();
  await page.waitForTimeout(400);
  const solo = (await board(1)).today_tasks.find((t) => t.key === "floor");
  await completeAndInspect(solo, "single-member round rollover");
  check(
    (await board(1)).rounds.find((r) => r.key === "floor").sequence,
    solo.sequence + 1,
    "animation does not delay the server round",
  );
  await page.goto(origin + "/" + name + ".html?section=water");
  await page.getByTestId("pane-water").waitFor();
  await page.waitForTimeout(400);
  await completeAndInspect((await board()).water_task, "water handoff");
  // Missing small-button feedback used to fall through the component styles.
  await page.getByTestId("open-tools").tap();
  const dialog = page.getByRole("dialog").last();
  await dialog.waitFor();
  await page.locator('.sheet-layer[data-phase="open"]').waitFor();
  const close = dialog.getByRole("button", { name: "关闭详情", exact: true });
  const bounds = await close.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(120);
  check(
    await close.evaluate(
      (e) => new DOMMatrix(getComputedStyle(e).transform).a < 0.99,
    ),
    true,
    "small drawer controls have tactile press feedback",
  );
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(origin + "/" + name + ".html?room=1");
  await page.getByTestId("pane-duty").waitFor();
  const reduced = (await board(1)).today_tasks.find((t) => t.key === "toilet");
  await page
    .locator(".task-selector button")
    .filter({ hasText: reduced.name })
    .tap();
  await page.getByTestId(`complete-${reduced.key}-${reduced.id}`).tap();
  await page.getByTestId(`undo-${reduced.id}`).waitFor();
  check(
    await page
      .locator(".completion-surface.is-round,.completion-particles")
      .count(),
    0,
    "reduced motion completes without decorative motion",
  );
  check(errors, [], "no runtime exceptions");
  await fs.writeFile(
    path.join(evidence, `${safari ? "webkit" : "chromium"}-frames.json`),
    JSON.stringify(traces),
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
  try {
    for (const context of browser?.contexts() || []) await context.close();
    if (capture)
      await capture.saveAs(path.join(evidence, "completion-interactions.webm"));
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
    h.close();
    await fs.writeFile(
      path.join(
        evidence,
        `${process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium"}-frames.json`,
      ),
      JSON.stringify(traces),
    );
  }
}

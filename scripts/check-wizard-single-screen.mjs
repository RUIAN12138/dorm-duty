// Isolated Vue preview. Mobile viewports/IME events are simulation, not devices.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const base = process.env.DORM_WIZARD_ORIGIN || "http://127.0.0.1:8104";
const out = `data/wizard-single-screen/${engine}`;
await fs.mkdir(out, { recursive: true });
const b = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "chromium"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {},
);
const c = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
  recordVideo: { dir: `${out}/video`, size: { width: 390, height: 844 } },
});
const p = await c.newPage();
p.setDefaultTimeout(12000);
const checks = [],
  errors = [],
  writes = [],
  startupAuth = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("request", (r) => {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(r.method())) return;
  const path = new URL(r.url()).pathname;
  if (path === "/email/enter") {
    startupAuth.push(path);
    return;
  }
  if (/\/(guest|chores|dorms|email)\//.test(path)) writes.push(r.url());
});
const check = (v, s) => {
  assert.ok(v, s);
  checks.push(s);
  console.log("PASS", s);
};
const step = () => p.locator(".wizard-step:not([aria-hidden=true])");
async function settle() {
  await p.waitForFunction(() => {
    const root = document.querySelector(".dorm-wizard");
    return (
      root &&
      !root
        .getAnimations({ subtree: true })
        .some(
          (a) =>
            a.playState === "running" &&
            a.effect?.getTiming().iterations !== Infinity &&
            !a.effect?.target?.closest?.(".dorm-companion"),
        )
    );
  });
}
async function goto(i) {
  await p.locator(".progress-hit").nth(i).click();
  await settle();
}
async function fits(label) {
  await p.waitForFunction(
    () =>
      Math.abs(
        document.querySelector(".dorm-wizard").getBoundingClientRect().height -
          (visualViewport?.height || innerHeight),
      ) < 1,
  );
  await settle();
  const info = await p.evaluate(() => {
    const el = document.querySelector(".wizard-body"),
      footer = document.querySelector(".wizard-footer"),
      active = document.querySelector(".wizard-step:not([aria-hidden=true])");
    return {
      scroll: el.scrollHeight,
      height: el.clientHeight,
      content: active.getBoundingClientRect().toJSON(),
      footer: footer.getBoundingClientRect().toJSON(),
      width: innerWidth,
      viewport: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  check(
    info.scroll <= info.height + 2 &&
      info.content.bottom <= info.footer.top + 2 &&
      info.footer.bottom <= info.viewport + 1 &&
      info.scrollWidth <= info.width,
    label + " fits one viewport " + JSON.stringify(info),
  );
}
try {
  await p.goto(base + "/?preview=new-dorm");
  await p.getByRole("textbox", { name: "宿舍名称", exact: true }).waitFor();
  // Seed only the dedicated local experience draft; create no real room/members.
  await p.evaluate(async () => {
    const { createDormDraft } = await import("/src/interaction/dormDraft.ts");
    const d = createDormDraft();
    d.name = "一起生活";
    localStorage.setItem(
      "dorm-create-experience-v2",
      JSON.stringify({ at: Date.now(), draft: d }),
    );
  });
  await p.goto(base + "/?preview=new-dorm");
  await p.locator(".dorm-wizard").waitFor();
  writes.length = 0;
  check(
    (await p.locator(".progress-hit").count()) === 5,
    "creation keeps five major pages",
  );
  const sizes = await p.locator(".creation-progress").evaluate((el) => {
    const track = el.querySelector(".progress-track").getBoundingClientRect();
    return {
      track: track.height,
      nodes: [...el.querySelectorAll(".progress-node")].map((n) => ({
        h: n.getBoundingClientRect().height,
        w: n.getBoundingClientRect().width,
        color: getComputedStyle(n).backgroundColor,
      })),
      text: el.innerText,
    };
  });
  check(
    sizes.track >= 28 &&
      sizes.nodes.length === 5 &&
      sizes.nodes.every(
        (n) =>
          n.h === sizes.track &&
          n.w === sizes.track &&
          n.color === "rgb(255, 255, 255)",
      ) &&
      !sizes.text.trim(),
    "thick track contains equal-diameter white circles without numbers",
  );
  for (const [width, height] of [
    [375, 700],
    [390, 844],
    [430, 932],
  ]) {
    await p.setViewportSize({ width, height });
    // Stress explicit 47px top/34px bottom insets; desktop env() is otherwise zero.
    await p.evaluate(() => {
      document.querySelector(".dorm-wizard").style.paddingTop = "57px";
      document.querySelector(".wizard-footer").style.paddingBottom = "46px";
    });
    for (let i = 0; i < 5; i++) {
      await goto(i);
      await fits(`${width}x${height} step ${i}`);
      if (width === 390) await p.screenshot({ path: `${out}/step-${i}.png` });
    }
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await goto(1);
  await p.getByRole("button", { name: "自定义任务", exact: true }).click();
  await step().locator(".task-editor input").fill("擦窗");
  await fits("task-name editor");
  check(
    await step()
      .locator(".task-editor input")
      .evaluate((el) => {
        const r = el.getBoundingClientRect(),
          body = el.closest(".wizard-body").getBoundingClientRect();
        return (
          r.left >= body.left &&
          r.right <= body.right &&
          getComputedStyle(el).scale === "1"
        );
      }),
    "focused task field stays inside the body without stacked input scaling",
  );
  await p.setViewportSize({ width: 375, height: 700 });
  await fits("375x700 task-name editor");
  await p.setViewportSize({ width: 390, height: 844 });
  await fits("restored task-name editor");
  await p.screenshot({ path: `${out}/task-editor.png` });
  await p.getByRole("button", { name: "‹ 返回任务", exact: true }).click();
  check(
    (await step().locator(".template-card").count()) === 4,
    "task templates are paged at four cards",
  );
  await p.getByRole("button", { name: "下一组", exact: true }).click();
  check(
    (await step().locator(".template-card").count()) === 1,
    "next template group exposes custom task",
  );
  await fits("paged templates");
  const grid = await step().locator(".template-grid").boundingBox();
  await p.mouse.move(grid.x + 25, grid.y + 30);
  await p.mouse.down();
  await p.mouse.move(grid.x + grid.width - 25, grid.y + 30, { steps: 8 });
  await p.mouse.up();
  check(
    (await step().locator(".template-card").count()) === 4,
    "horizontal task-group swipe returns without toggling task",
  );
  await goto(3);
  await p
    .getByRole("button", {
      name: "按时间安排 按设定时间执行并截止",
      exact: true,
    })
    .click();
  await fits("dedicated time panel");
  await p.setViewportSize({ width: 375, height: 700 });
  await fits("375x700 time panel");
  await p.setViewportSize({ width: 390, height: 844 });
  await fits("restored time panel");
  check(
    (await step().locator(".rule-mode-picks").count()) === 0,
    "time panel replaces mode cards instead of stacking below",
  );
  await p.screenshot({ path: `${out}/time-panel.png` });
  await p.getByRole("button", { name: "‹ 完成方式", exact: true }).click();
  await p.getByRole("button", { name: "为单项任务调整", exact: true }).click();
  await fits("per-task rule panel");
  await p.setViewportSize({ width: 375, height: 700 });
  await fits("375x700 per-task rules");
  await p.setViewportSize({ width: 390, height: 844 });
  // Track responds before release, one changed-step signal per selection.
  await p.evaluate(() => {
    window.__wizardHaptics = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (x) => {
        window.__wizardHaptics.push(x);
        return true;
      },
    });
  });
  const host = await p.locator(".creation-progress").boundingBox();
  await p.mouse.move(host.x + 24, host.y + 30);
  await p.mouse.down();
  const reveal = await p.evaluate(async () => {
    const frames = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(requestAnimationFrame);
      frames.push(
        Number(
          getComputedStyle(document.querySelector(".progress-glass-surface"))
            .opacity,
        ),
      );
    }
    return frames;
  });
  check(
    reveal.some((x) => x > 0 && x < 1),
    "glass reveal has visible intermediate opacity frames",
  );
  await p.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".progress-glass-surface"))
        .opacity === "1",
  );
  await p.mouse.move(host.x + host.width - 24, host.y + 30, { steps: 18 });
  check(
    (await step().getAttribute("data-step")) === "preview",
    "drag switches page before pointer release",
  );
  const holdSignals = await p.evaluate(() => window.__wizardHaptics.length);
  await p.waitForTimeout(150);
  check(
    (await p.evaluate(() => window.__wizardHaptics.length)) === holdSignals,
    "holding at a step does not repeat haptics",
  );
  await p.mouse.move(host.x + 24, host.y + 30, { steps: 18 });
  check(
    (await step().getAttribute("data-step")) === "name",
    "reverse drag follows without waiting for release",
  );
  await p.mouse.up();
  await p.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".progress-glass-surface"))
        .opacity === "0",
  );
  await p.mouse.click(host.x + 24 + (host.width - 48) * 0.1325, host.y + 30);
  check(
    (await step().getAttribute("data-step")) === "tasks",
    "tap between live hysteresis and nearest step commits the same page as its settled thumb",
  );
  await goto(0);
  const hidden = await p
    .locator(".progress-glass-surface")
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  check(hidden < 0.8, "release shrinks glass back into track");
  for (let i = 0; i < 5; i++) {
    await p.locator(".progress-hit").nth(2).click();
  }
  await p.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".progress-glass-surface"))
        .opacity === "0",
  );
  check(true, "rapid same-step taps leave no glass residue");
  await p.mouse.move(host.x + 24, host.y + 30);
  await p.mouse.down();
  await p.mouse.move(host.x + host.width / 2, host.y + 30, { steps: 6 });
  await p
    .locator(".creation-progress")
    .dispatchEvent("pointercancel", { pointerId: 1, isPrimary: true });
  await p.mouse.up();
  await p.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".progress-glass-surface"))
        .opacity === "0",
  );
  check(true, "cancel returns glass and releases gesture");
  await p.locator(".progress-hit").first().focus();
  await p.keyboard.press("End");
  check(
    (await step().getAttribute("data-step")) === "preview",
    "keyboard End remains usable immediately after pointer cancellation",
  );
  await p.keyboard.press("Home");
  check(
    (await step().getAttribute("data-step")) === "name",
    "keyboard Home returns immediately without showing a transient touch thumb",
  );
  await p.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await goto(3);
  await fits("dark reduced-motion rules");
  await p.screenshot({ path: `${out}/dark-reduced.png` });
  await goto(0);
  await p.getByRole("textbox", { name: "宿舍名称", exact: true }).click();
  await p.evaluate(() => {
    const v = visualViewport;
    Object.defineProperty(v, "height", { configurable: true, get: () => 420 });
    v.dispatchEvent(new Event("resize"));
  });
  await p.waitForFunction(() =>
    document.querySelector(".dorm-wizard").classList.contains("is-compact"),
  );
  const footer = await p.locator(".wizard-footer").boundingBox();
  check(
    footer.y + footer.height <= 421,
    "single viewport state keeps primary action above simulated keyboard",
  );
  check(
    writes.length === 0,
    "creation experience performs zero business writes " +
      JSON.stringify(writes),
  );
  check(errors.length === 0, "no browser runtime errors");
  // Maximum supported draft: all twenty IDs stay reachable through in-step paging.
  await p.evaluate(async () => {
    const { createDormDraft, createCustomTask } = await import(
      "/src/interaction/dormDraft.ts"
    );
    const d = createDormDraft();
    d.name = "二十项草稿";
    for (const t of d.tasks) t.enabled = true;
    while (d.tasks.length < 20) {
      const t = createCustomTask();
      t.name = "任务" + (d.tasks.length + 1);
      d.tasks.push(t);
    }
    d.tasks.forEach((t, i) => {
      t.enabled = true;
      t.page = i < 4 ? "duty" : "water";
    });
    localStorage.setItem(
      "dorm-create-experience-v2",
      JSON.stringify({ at: Date.now(), draft: d }),
    );
  });
  await p.goto(base + "/?preview=new-dorm");
  await p.locator(".dorm-wizard").waitFor();
  await goto(1);
  const names = [];
  for (let group = 0; group < 5; group++) {
    names.push(
      ...(await step().locator(".template-card strong").allTextContents()),
    );
    if (group < 4)
      await p.getByRole("button", { name: "下一组", exact: true }).click();
  }
  check(
    names.length === 20 && new Set(names).size === 20,
    "all twenty template IDs remain reachable without a long list",
  );
  await goto(2);
  await p.setViewportSize({ width: 375, height: 700 });
  await p.evaluate(() => {
    document.querySelector(".dorm-wizard").style.paddingTop = "57px";
    document.querySelector(".wizard-footer").style.paddingBottom = "46px";
  });
  await fits("twenty-task assignment");
  const second = p.locator("[data-task-zone=water]");
  const secondNames = [];
  while (true) {
    secondNames.push(
      ...(await second.locator(".page-task--compact").allTextContents()),
    );
    const next = second.getByRole("button", { name: "下一组", exact: true });
    if (await next.isDisabled()) break;
    await next.click();
  }
  check(
    secondNames.length === 16 && new Set(secondNames).size === 16,
    "all second-page tasks remain reachable through assignment paging",
  );
  await p.screenshot({ path: `${out}/many-tasks.png` });
  await p.setViewportSize({ width: 320, height: 568 });
  await goto(1);
  check(
    await p
      .locator(".wizard-footer")
      .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight + 1),
    "small-screen footer stays available with safe body scrolling",
  );
  check(
    writes.length === 0 && errors.length === 0,
    "maximum-size draft has no real writes or runtime errors " +
      JSON.stringify({ writes, errors }),
  );
  await fs.writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        engine,
        checks,
        errors,
        writes,
        startupAuth,
        physicalDevices: "not tested",
      },
      null,
      2,
    ) + "\n",
  );
} catch (e) {
  await p.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw e;
} finally {
  const video = p.video();
  await c.close();
  if (video) await fs.copyFile(await video.path(), `${out}/create-flow.webm`);
  await b.close();
}

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../../../../node_modules/@playwright/test/index.mjs";
import { createHarness } from "../../../../../site/scripts/check-cloud-backend.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium",
  base = process.env.DORM_WIZARD_ORIGIN || "http://127.0.0.1:8119";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "only loopback preview is allowed",
);
const out = `data/creation-polish/${engine}`;
await fs.mkdir(out, { recursive: true });
const b = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "chromium"
    ? {
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }
    : {},
);
const context = await b.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  serviceWorkers: "block",
  recordVideo: { dir: out, size: { width: 390, height: 844 } },
});
const p = await context.newPage();
p.setDefaultTimeout(15000);
const h = await createHarness(),
  checks = [],
  errors = [],
  requests = [];
let tracking = false;
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
  console.log("PASS", label);
};
const room = await (
  await h.request("/guest/create", {
    method: "POST",
    data: { name: "隔离入口", nickname: "甲", members: ["乙"] },
  })
).json();
const identity = {
  id: room.dorm.id,
  name: room.dorm.name,
  invite_code: room.invite_code,
  member_id: room.member_id,
  nickname: "甲",
  is_creator: true,
};
await p.route(/\/(email|chores|auth|dorms|guest)\//, async (route) => {
  const req = route.request(),
    url = new URL(req.url());
  if (tracking) {
    requests.push(`${req.method()} ${url.pathname}`);
    return route.fulfill({
      status: 503,
      json: { error: { message: "预览不应访问真实API" } },
    });
  }
  if (url.pathname.startsWith("/email/"))
    return route.fulfill({
      json:
        url.pathname === "/email/config"
          ? { available: true, registration_required: true }
          : url.pathname === "/email/me"
            ? {
                logged_in: true,
                email: "sandbox@example.invalid",
                rooms: [identity],
              }
            : url.pathname === "/email/enter"
              ? { ...identity, access_token: room.access_token }
              : {},
    });
  if (url.pathname === "/chores/push/config")
    return route.fulfill({ json: { available: false } });
  const response = await h.request(url.pathname + url.search, {
    method: req.method(),
    token: req.headers().authorization?.replace(/^Bearer /, ""),
    ...(req.postData() ? { data: req.postDataJSON() } : {}),
  });
  await route.fulfill({
    status: response.status,
    contentType: "application/json",
    body: await response.text(),
  });
});
p.on("pageerror", (e) => errors.push(e.message));
const { createDormDraft } = await import("../../../interaction/dormDraft.ts");
const initial = createDormDraft();
initial.name = "一起生活";
await p.addInitScript(
  (draft) =>
    !localStorage.getItem("dorm-create-experience-v2") &&
    localStorage.setItem(
      "dorm-create-experience-v2",
      JSON.stringify({ at: Date.now(), draft }),
    ),
  initial,
);
const active = () => p.locator(".wizard-step:not([inert])");
async function settled() {
  await p.waitForFunction(
    () =>
      [
        ...document.querySelectorAll(".wizard-step:not([inert]) [data-enter]"),
      ].every((el) => Number(getComputedStyle(el).opacity) > 0.99) &&
      !document.querySelector(
        ".creation-panel-enter-active,.creation-panel-leave-active",
      ),
  );
}
async function step(index, kind) {
  await p.locator(".progress-hit").nth(index).click();
  await p.locator(`.wizard-step[data-step="${kind}"]:not([inert])`).waitFor();
  await settled();
}
async function fit(label) {
  const r = await p.locator(".wizard-body").evaluate((el) => {
    const footer = document
      .querySelector(".wizard-footer")
      .getBoundingClientRect();
    const root = document.querySelector(".dorm-wizard").getBoundingClientRect();
    const active = document.querySelector(".wizard-step:not([inert])");
    return {
      overflow: el.scrollHeight - el.clientHeight,
      horizontal: document.documentElement.scrollWidth - innerWidth,
      footer: footer.bottom <= root.bottom + 1,
      controls: [...active.querySelectorAll("input,textarea,button")]
        .filter((n) => !n.closest("[inert]"))
        .every((n) => {
          const r = n.getBoundingClientRect();
          return r.height === 0 || r.bottom <= footer.top + 1;
        }),
    };
  });
  check(
    r.overflow <= 2 && r.horizontal <= 1 && r.footer && r.controls,
    `${label}: single-screen core controls and footer ${JSON.stringify(r)}`,
  );
}
async function stored() {
  return p.evaluate(
    () => JSON.parse(localStorage.getItem("dorm-create-experience-v2")).draft,
  );
}

try {
  await p.goto(base + "/?preview=new-dorm");
  await p.locator(".dorm-wizard").waitFor();
  await settled();
  // Finish synthetic app startup, then prohibit every business API request.
  await p.waitForFunction(
    () =>
      document.querySelector(".dorm-wizard") &&
      !document.querySelector(".startup-overlay"),
  );
  tracking = true;
  check(
    (await p.locator(".progress-hit").count()) === 5,
    "five main steps retained",
  );
  await step(1, "tasks");
  check(
    (await active().locator(".creation-task-rail").count()) === 0,
    "template selection has no duplicate name rail",
  );
  const card = active().getByRole("button", { name: "地板", exact: true });
  await card.click();
  check(
    (await card.getAttribute("aria-pressed")) === "false" &&
      (await active().locator(".task-editor").count()) === 0,
    "template deselection stays in selector",
  );
  await card.click();
  check(
    (await card.getAttribute("aria-pressed")) === "true" &&
      (await active().locator(".task-editor").count()) === 0,
    "template selection does not jump into name editing",
  );
  await p.screenshot({ path: out + "/tasks.png" });
  const footerBefore = await p.locator(".wizard-footer").boundingBox();
  await p.evaluate(() => {
    window.__panelFrames = [];
    let left = 28;
    function record() {
      const nodes = [...document.querySelectorAll("[data-creation-panel]")];
      window.__panelFrames.push({
        opacity: nodes.map((n) => Number(getComputedStyle(n).opacity)),
        transform: nodes.map((n) => getComputedStyle(n).transform),
        footer: document.querySelector(".wizard-footer").getBoundingClientRect()
          .y,
      });
      if (--left) requestAnimationFrame(record);
    }
    requestAnimationFrame(record);
  });
  await active().getByRole("button", { name: "编辑任务", exact: true }).click();
  await p.waitForFunction(
    () =>
      !!document.querySelector(
        '.creation-panel-leave-active[inert][aria-hidden="true"]',
      ),
  );
  check(
    (await active()
      .locator(".creation-panel-leave-active")
      .getAttribute("inert")) === "",
    "outgoing selection is inert during crossfade",
  );
  await settled();
  await p.waitForFunction(() => window.__panelFrames.length === 28);
  const frames = await p.evaluate(() => window.__panelFrames);
  check(
    frames.some(
      (f) =>
        f.opacity.some((o) => o > 0 && o < 0.99) &&
        f.transform.some((t) => t !== "none"),
    ) && frames.every((f) => f.opacity.some((o) => o > 0.45)),
    "crossfade has intermediate opacity/position and no blank frame",
  );
  check(
    Math.max(...frames.map((f) => f.footer)) -
      Math.min(...frames.map((f) => f.footer)) <
      1,
    "footer stays fixed throughout panel transition",
  );
  await fs.writeFile(
    out + "/panel-frames.json",
    JSON.stringify(frames, null, 2),
  );
  await active()
    .getByRole("textbox", { name: "任务名称", exact: true })
    .fill("地面清洁");
  await active()
    .getByRole("textbox", { name: "简短说明", exact: true })
    .fill("扫地，再拖地");
  await active()
    .getByRole("group", { name: "编辑任务", exact: true })
    .getByRole("button", { name: "洗手池", exact: true })
    .click();
  await settled();
  await active()
    .getByRole("group", { name: "编辑任务", exact: true })
    .getByRole("button", { name: "地面清洁", exact: true })
    .click();
  await settled();
  check(
    (await active()
      .getByRole("textbox", { name: "简短说明", exact: true })
      .inputValue()) === "扫地，再拖地",
    "switching editors retains task text",
  );
  check(
    (await stored()).tasks.find((t) => t.key === "floor").name === "地面清洁",
    "renaming preserves stable business ID",
  );
  check(
    Math.abs(
      (await p.locator(".wizard-footer").boundingBox()).y - footerBefore.y,
    ) < 1,
    "selection/editor transition keeps footer fixed",
  );
  await p.screenshot({ path: out + "/editor.png" });
  await active()
    .getByRole("button", { name: "‹ 返回任务", exact: true })
    .click();
  await settled();
  await active()
    .getByRole("button", { name: "自定义任务", exact: true })
    .click();
  await settled();
  await active()
    .getByRole("textbox", { name: "任务名称", exact: true })
    .fill("阳台");
  const added = (await stored()).tasks.at(-1);
  check(
    /^task_[a-f0-9]{32}$/.test(added.key) && added.name === "阳台",
    "custom task opens editor with unique ID",
  );
  for (const size of [
    { width: 320, height: 650 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await p.setViewportSize(size);
    for (const [index, kind] of [
      "name",
      "tasks",
      "pages",
      "rules",
      "preview",
    ].entries()) {
      await step(index, kind);
      await fit(`${size.width}×${size.height} ${kind}`);
      if (size.width === 390)
        await p.screenshot({ path: out + "/" + kind + "-after.png" });
    }
  }
  await p.setViewportSize({ width: 390, height: 650 });
  await step(3, "rules");
  await active()
    .getByRole("button", {
      name: "按时间安排 按设定时间执行并截止",
      exact: true,
    })
    .click();
  await settled();
  await fit("short-screen scheduled time");
  await p.screenshot({ path: out + "/time.png" });
  await active()
    .getByRole("button", { name: "为单项任务调整", exact: true })
    .click();
  await settled();
  await active().getByRole("tab", { name: "时间", exact: true }).click();
  await settled();
  await fit("short-screen individual time");
  await active()
    .getByRole("button", { name: "‹ 使用统一方式", exact: true })
    .click();
  await settled();
  // Continuous progress scrubbing must update page content before release.
  const hits = await p.locator(".progress-hit").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  await p.mouse.move(hits[3].x, hits[3].y);
  await p.mouse.down();
  for (const n of [2, 1, 0, 2, 4, 1]) {
    await p.mouse.move(hits[n].x, hits[n].y, { steps: 3 });
    await p.waitForFunction(
      (kind) =>
        document.querySelector(".wizard-step:not([inert])")?.dataset.step ===
        kind,
      ["name", "tasks", "pages", "rules", "preview"][n],
    );
  }
  await p.mouse.up();
  await settled();
  check(
    (await active().getAttribute("data-step")) === "tasks",
    "rapid progress scrubbing updates content before release",
  );
  // Twenty tasks: selected item must reveal without scrolling the whole wizard.
  const stress = await stored();
  while (stress.tasks.length < 20) {
    const n = stress.tasks.length;
    stress.tasks.push({
      ...stress.tasks[0],
      key: `task_${n.toString(16).padStart(32, "0")}`,
      name: `自定义清洁任务${n}`,
      page: "water",
    });
  }
  await p.evaluate(
    (draft) =>
      localStorage.setItem(
        "dorm-create-experience-v2",
        JSON.stringify({ at: Date.now(), draft }),
      ),
    stress,
  );
  tracking = false;
  await p.goto(base + "/?preview=new-dorm");
  await p.locator(".dorm-wizard").waitFor();
  await step(1, "tasks");
  tracking = true;
  check(
    (await active()
      .getByRole("button", { name: "自定义任务", exact: true })
      .count()) === 0,
    "twenty-task cap retained",
  );
  await active().getByRole("button", { name: "编辑任务", exact: true }).click();
  await settled();
  const rail = active().getByRole("group", { name: "编辑任务", exact: true });
  await rail.getByRole("button").first().focus();
  await p.keyboard.press("End");
  await settled();
  await p.waitForFunction(() => {
    const host = document.querySelector(".creation-task-rail"),
      r = host.getBoundingClientRect(),
      item = host.querySelector("[aria-pressed=true]").getBoundingClientRect();
    return item.left >= r.left - 1 && item.right <= r.right + 1;
  });
  check(
    (await rail.getByRole("button").last().getAttribute("aria-pressed")) ===
      "true",
    "End selects and locally reveals twentieth task",
  );
  check(
    (await p.locator(".wizard-body").evaluate((el) => el.scrollTop)) === 0,
    "revealing task rail does not scroll wizard",
  );
  await fit("twenty-task editor");
  check(
    await rail.getByRole("button").evaluateAll((nodes) =>
      nodes.every((n) => {
        const r = n.getBoundingClientRect();
        return r.height >= 44 && r.width <= 156.1;
      }),
    ),
    "rail keeps single-line 44px targets with bounded width",
  );
  await p.screenshot({ path: out + "/twenty-tasks.png" });
  await p.evaluate(async () => {
    for (const index of [0, 5, 1, 12, 2, 19]) {
      document.querySelectorAll(".creation-task-rail button")[index].click();
      await new Promise(requestAnimationFrame);
    }
  });
  await settled();
  check(
    (await active().locator(".task-editor").count()) === 1 &&
      (await rail.getByRole("button").last().getAttribute("aria-pressed")) ===
        "true",
    "interrupted task switches settle to one active editor",
  );
  const focusedInput = active().getByRole("textbox", {
    name: "任务名称",
    exact: true,
  });
  await focusedInput.focus();
  const retained = await focusedInput.inputValue();
  await p.evaluate(() => {
    Object.defineProperty(visualViewport, "height", {
      configurable: true,
      get: () => 420,
    });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await p.waitForFunction(
    () =>
      document.querySelector(".dorm-wizard").classList.contains("is-compact") &&
      document.querySelector(".dorm-wizard").getBoundingClientRect().height ===
        420,
  );
  check(
    await p
      .locator(".wizard-footer")
      .evaluate(
        (el) => el.getBoundingClientRect().bottom <= visualViewport.height + 1,
      ),
    "simulated keyboard viewport keeps footer above viewport edge",
  );
  check(
    (await focusedInput.inputValue()) === retained,
    "viewport compression retains focused task text",
  );
  await p.screenshot({ path: out + "/keyboard-viewport-simulation.png" });
  await focusedInput.blur();
  await p.evaluate(() => {
    delete visualViewport.height;
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await p.waitForFunction(
    () =>
      document.querySelector(".dorm-wizard").getBoundingClientRect().height ===
      650,
  );

  await p.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await step(3, "rules");
  await active()
    .getByRole("button", { name: "为单项任务调整", exact: true })
    .click();
  await settled();
  const rulesRail = active().getByRole("group", {
    name: "选择任务",
    exact: true,
  });
  await rulesRail.getByRole("button").first().focus();
  await p.keyboard.press("End");
  await settled();
  await fit("dark reduced-motion twenty-task rules");
  check(
    (await active()
      .locator(".creation-panel-enter-active,.creation-panel-leave-active")
      .count()) === 0,
    "reduced motion settles without residual panels",
  );
  await p.screenshot({ path: out + "/dark-reduced.png" });
  check(
    requests.length === 0,
    "editing and switching creation steps issue zero business API requests",
  );
  // Mount the actual shared wizard in workspace mode with a separate synthetic draft.
  // This checks its existing branch without entering, saving or mutating a real room.
  await p.getByRole("button", { name: "退出配置", exact: true }).click();
  await p.locator(".dorm-wizard").waitFor({ state: "detached" });
  await p.evaluate(async (draft) => {
    const { createApp } = await import("/node_modules/.vite/deps/vue.js");
    const { createPinia } = await import("/node_modules/.vite/deps/pinia.js");
    const { default: Wizard } = await import(
      "/src/components/onboarding/DormWizard.vue"
    );
    const host = document.createElement("div");
    document.body.append(host);
    window.__workspaceApp = createApp(Wizard, {
      workspace: true,
      initial: draft,
      draftKey: "creation-regression-workspace",
      creatorName: "测试创建者",
    }).use(createPinia());
    window.__workspaceApp.mount(host);
  }, initial);
  await p.locator(".dorm-wizard.is-workspace").waitFor();
  await settled();
  check(
    (await active().locator(".workspace-task-row").count()) === 4 &&
      (await p.locator(".creation-progress.is-create-mode").count()) === 0,
    "workspace retains task-list entry and its own progress behavior",
  );
  await active().locator(".workspace-task-row>.wizard-choice").first().click();
  await settled();
  check(
    (await active().locator("input,textarea").count()) === 2 &&
      (await active().locator(".creation-task-rail").count()) === 0,
    "workspace task editor keeps original fields without creation-only rail",
  );
  await p.evaluate(() => window.__workspaceApp.unmount());
  check(
    requests.every((request) => request === "GET /chores/board"),
    `exiting restores the original board using reads only (${requests.join(",")})`,
  );
  check(errors.length === 0, `no browser errors (${errors.join(";")})`);
} finally {
  await context.close();
  await b.close();
  h.close();
  await fs.writeFile(
    out + "/result.json",
    JSON.stringify({ engine, checks, errors, requests }, null, 2),
  );
}

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  chromium,
  webkit,
} from "../frontend/node_modules/@playwright/test/index.mjs";
import { createHarness } from "../site/scripts/check-cloud-backend.mjs";
const engine = process.env.DORM_BROWSER === "webkit" ? "webkit" : "chromium";
const base = process.env.DORM_WIZARD_ORIGIN || "http://127.0.0.1:8104";
const out = `data/preview-task-navigation/${engine}`;
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
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
  recordVideo: { dir: `${out}/video`, size: { width: 390, height: 844 } },
});
const p = await context.newPage();
p.setDefaultTimeout(15000);
const h = await createHarness(),
  checks = [],
  errors = [],
  previewRequests = [],
  writes = [];
let previewTracking = false;
const check = (ok, label) => {
  assert.ok(ok, label);
  checks.push(label);
  console.log("PASS", label);
};
const task = (key, name, page) => ({
  key,
  name,
  page,
  enabled: true,
  content: `整理${name}`,
  rotation: key === "water" ? "completion" : "round",
  display: "title",
  deadline: "22:00",
  interval: 3,
});
const config = {
  schema_version: 2,
  policy: "soft",
  second_page_kind: "tasks",
  pages: [
    { id: "duty", label: "值日" },
    { id: "water", label: "抬水" },
    { id: "calendar", label: "日历" },
  ],
  tasks: [
    task("floor", "地板", "duty"),
    task("toilet", "厕所", "duty"),
    task("water", "抬水", "water"),
    task("sink", "洗手池", "water"),
    task(`task_${"1".repeat(32)}`, "阳台", "water"),
  ],
};
const old = await (
  await h.request("/guest/create", {
    method: "POST",
    data: { name: "旧宿舍隔离样本", nickname: "旧成员", members: ["旧室友"] },
  })
).json();
const room = await (
  await h.request("/guest/create", {
    method: "POST",
    data: {
      name: "布局一致",
      nickname: "创建者",
      members: [],
      configuration: config,
    },
  })
).json();
assert.ok(room.access_token, JSON.stringify(room));
const legacySnapshot = () => {
  const result = {};
  for (const { name } of h.db.sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()) {
    if (!/^[a-z_]+$/.test(name)) continue;
    const columns = h.db.sqlite.prepare(`PRAGMA table_info(${name})`).all();
    if (columns.some((c) => c.name === "dorm_id"))
      result[name] = h.db.sqlite
        .prepare(`SELECT * FROM ${name} WHERE dorm_id=? ORDER BY rowid`)
        .all(old.dorm.id);
  }
  return JSON.stringify(result);
};
const beforeLegacy = legacySnapshot();
await p.addInitScript(
  ({ invite, id }) => {
    localStorage.setItem(
      `dorm-welcome-guide-v2:${encodeURIComponent(invite)}:${id}`,
      "1",
    );
  },
  { invite: room.invite_code, id: room.member_id },
);
await p.route(/\/(email|chores|auth|dorms|guest)\//, async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.pathname.startsWith("/email/")) {
    const identity = {
      id: room.dorm.id,
      name: room.dorm.name,
      invite_code: room.invite_code,
      member_id: room.member_id,
      nickname: "创建者",
      is_creator: true,
    };
    return route.fulfill({
      json:
        url.pathname === "/email/config"
          ? { available: true, registration_required: true }
          : url.pathname === "/email/me"
            ? {
                logged_in: true,
                email: "layout@example.invalid",
                rooms: [identity],
              }
            : url.pathname === "/email/enter"
              ? { ...identity, access_token: room.access_token }
              : {},
    });
  }
  if (url.pathname === "/chores/push/config")
    return route.fulfill({ json: { available: false } });
  const response = await h.request(url.pathname + url.search, {
    method: request.method(),
    token: request.headers().authorization?.replace(/^Bearer /, ""),
    ...(request.postData() ? { data: JSON.parse(request.postData()) } : {}),
  });
  await route.fulfill({
    status: response.status,
    contentType: "application/json",
    body: await response.text(),
  });
});
p.on("pageerror", (e) => errors.push(e.message));
p.on("request", (r) => {
  const path = new URL(r.url()).pathname;
  if (previewTracking && ["fetch", "xhr"].includes(r.resourceType()))
    previewRequests.push(`${r.method()} ${path}`);
  if (
    ["POST", "PATCH", "PUT", "DELETE"].includes(r.method()) &&
    /^\/(chores|guest|dorms)\//.test(path)
  )
    writes.push(`${r.method()} ${path}`);
});
async function settled() {
  await p.waitForFunction(
    () =>
      !document
        .querySelector(".chore-board")
        ?.getAnimations({ subtree: true })
        .some(
          (a) =>
            a.playState === "running" &&
            a.effect?.getTiming().iterations !== Infinity,
        ),
  );
}
async function selectPage(root, name) {
  await root.locator(`.chore-bottom-nav [data-section=${name}]`).click();
  await root.getByTestId(`pane-${name}`).waitFor();
  await settled();
}
async function metrics(root, water = false) {
  return root.locator(".guest-page").evaluate((el, water) => {
    const board = el.querySelector(".chore-board"),
      identity = board.querySelector(".board-identity"),
      selector = board.querySelector(".task-selector"),
      title = board.querySelector(
        water ? ".new-task-title" : ".task-title-button",
      );
    const rect = (x) => {
      const r = x.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      main: rect(el),
      identity: rect(identity),
      selector: rect(selector),
      titleFont: getComputedStyle(title).fontSize,
      buttonFont: getComputedStyle(selector.querySelector("button")).fontSize,
      buttonRadius: getComputedStyle(selector.querySelector("button"))
        .borderRadius,
    };
  }, water);
}
try {
  await p.goto(base + "/?start=1");
  await p.getByTestId("pane-duty").waitFor();
  await settled();
  writes.length = 0;
  const liveDuty = await metrics(p);
  await p.screenshot({ path: `${out}/live-duty.png` });
  check(
    (await p.locator(".chore-personal .task-selector button").count()) === 2,
    "formal duty uses the unchanged shared production selector",
  );
  await selectPage(p, "water");
  check(
    (await p.locator(".new-task-pane .task-selector button").count()) === 3 &&
      (await p.locator(".new-task-pane article").count()) === 1,
    "formal second page renders three task tabs and one task body",
  );
  const liveWater = await metrics(p, true);
  await p.screenshot({ path: `${out}/live-water.png` });
  const pane = p.getByTestId("pane-water");
  await pane.locator(".task-selector button").nth(1).click();
  const titleFrames = await pane.evaluate(async (el) => {
    const frames = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(requestAnimationFrame);
      const title = el.querySelector(".new-task-heading:not([aria-hidden])");
      if (title)
        frames.push({
          opacity: Number(getComputedStyle(title).opacity),
          x: new DOMMatrixReadOnly(getComputedStyle(title).transform).m41,
        });
    }
    return frames;
  });
  check(
    titleFrames.some(
      (frame) =>
        frame.opacity > 0 && frame.opacity < 1 && Math.abs(frame.x) > 0.1,
    ),
    "second-page task title has real opacity and movement intermediate frames",
  );
  await settled();
  check(
    (await pane.locator("article").getAttribute("data-active-task")) === "sink",
    "second-page tab selects the correct stable task key",
  );
  const title = await pane.locator(".new-task-title-stage").boundingBox();
  await p.mouse.move(title.x + title.width * 0.75, title.y + title.height / 2);
  await p.mouse.down();
  await p.mouse.move(title.x + title.width * 0.25, title.y + title.height / 2, {
    steps: 8,
  });
  await p.mouse.up();
  await settled();
  check(
    (await pane.locator("article").getAttribute("data-active-task")) ===
      `task_${"1".repeat(32)}`,
    "second-page title swipe uses existing task gesture and selects the next task",
  );
  await selectPage(p, "duty");
  await selectPage(p, "water");
  check(
    (await p
      .getByTestId("pane-water")
      .locator("article")
      .getAttribute("data-active-task")) === `task_${"1".repeat(32)}`,
    "returning to second page retains its selected task",
  );
  const returnedPane = p.getByTestId("pane-water");
  for (const index of [0, 2, 1])
    await returnedPane.locator(".task-selector button").nth(index).click();
  await settled();
  check(
    (await returnedPane.locator("article").getAttribute("data-active-task")) ===
      "sink" && (await returnedPane.locator(".new-task-heading").count()) === 1,
    "rapid interrupted task changes settle on one correct title without residue",
  );
  check(
    writes.length === 0,
    "formal task selection and page switching create no business writes",
  );
  await p.goto(base + "/?preview=new-dorm");
  await p.locator(".dorm-wizard").waitFor();
  await p.evaluate((config) => {
    localStorage.setItem(
      "dorm-create-experience-v2",
      JSON.stringify({
        at: Date.now(),
        draft: { ...config, name: "布局一致", nickname: "创建者", members: [] },
      }),
    );
  }, config);
  await p.goto(base + "/?preview=new-dorm");
  await p.locator(".dorm-wizard").waitFor();
  check(
    (await p.locator(".progress-step-mark").count()) === 5 &&
      (await p.locator(".progress-node").count()) === 0,
    "five subtle internal marks indicate steps without large white nodes",
  );
  previewTracking = true;
  await p.getByRole("button", { name: "预览", exact: true }).click();
  const preview = p.getByTestId("live-draft-preview");
  await preview.getByTestId("pane-duty").waitFor();
  await settled();
  check(
    (await preview.locator(".content-stage").count()) === 1 &&
      (await preview.locator(".app-stage").count()) === 0,
    "preview uses the same natural content stage as formal signed-in pages",
  );
  const previewDuty = await metrics(preview);
  for (const key of ["identity", "selector"])
    for (const dim of ["x", "y", "width", "height"])
      check(
        Math.abs(previewDuty[key][dim] - liveDuty[key][dim]) < 2,
        `duty preview ${key}.${dim} matches formal page within 2px`,
      );
  check(
    previewDuty.titleFont === liveDuty.titleFont &&
      previewDuty.buttonFont === liveDuty.buttonFont &&
      previewDuty.buttonRadius === liveDuty.buttonRadius,
    "preview duty title and tab styling match formal page",
  );
  await p.screenshot({ path: `${out}/preview-duty.png` });
  await selectPage(preview, "water");
  const previewWater = await metrics(preview, true);
  for (const key of ["identity", "selector"])
    for (const dim of ["x", "y", "width", "height"])
      check(
        Math.abs(previewWater[key][dim] - liveWater[key][dim]) < 2,
        `water preview ${key}.${dim} matches formal page within 2px`,
      );
  check(
    previewWater.titleFont === liveWater.titleFont &&
      (await preview.locator(".new-task-pane article").count()) === 1,
    "preview water keeps formal typography and one selected task",
  );
  await preview.locator(".new-task-pane .task-selector button").nth(2).click();
  await settled();
  check(
    (await preview
      .locator(".new-task-pane article")
      .getAttribute("data-active-task")) === `task_${"1".repeat(32)}`,
    "preview second-page selection matches formal stable task key",
  );
  await preview.locator(".new-task-title").click();
  await p.getByTestId("task-detail").waitFor();
  check(
    await p
      .getByTestId("task-detail")
      .innerText()
      .then((t) => t.includes("阳台")),
    "preview opens the selected task in the real detail sheet",
  );
  await p.keyboard.press("Escape");
  await preview.locator(".new-task-title").evaluate((el) => el.blur());
  await p.screenshot({ path: `${out}/preview-water.png` });
  for (const [width, height] of [
    [320, 568],
    [430, 932],
  ]) {
    await p.setViewportSize({ width, height });
    await settled();
    check(
      await preview.locator(".task-selector").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          (el.scrollWidth <= el.clientWidth + 1 ||
            getComputedStyle(el).overflowX === "auto")
        );
      }),
      "task tabs fit or scroll locally without expanding the page",
    );
    check(
      await preview.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          (el.scrollWidth <= el.clientWidth + 1 ||
            getComputedStyle(el).overflowX === "auto")
        );
      }),
      "preview has no horizontal page overflow",
    );
  }
  await p.setViewportSize({ width: 320, height: 568 });
  const scrollable = await preview.evaluate(
    (el) => el.scrollHeight > el.clientHeight + 20,
  );
  if (scrollable) {
    await preview.evaluate((el) => {
      el.scrollTop = 0;
    });
    if (engine === "webkit") {
      const allowed = await preview
        .locator(".new-task-title")
        .evaluate((el) => {
          el.closest(".live-preview").scrollTop = 1;
          const event = new WheelEvent("wheel", {
            deltaY: 80,
            bubbles: true,
            cancelable: true,
          });
          el.dispatchEvent(event);
          return !event.defaultPrevented;
        });
      check(
        allowed,
        "mobile WebKit scroll container accepts scroll positions and does not cancel scrolling wheel events (synthetic handler check)",
      );
    } else {
      await p.mouse.move(180, 420);
      await p.mouse.wheel(0, 80);
      await p.waitForFunction(
        () => document.querySelector(".live-preview").scrollTop > 0,
      );
      check(
        await preview
          .locator(".screen-surface")
          .evaluate((el) => getComputedStyle(el).transform === "none"),
        "preview uses native local scroll rather than pulling the whole screen while content can scroll",
      );
    }
    await preview.evaluate((el) => {
      el.scrollTop = 0;
    });
  }
  await p.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: `${out}/dark-water.png` });
  await preview.getByTestId("exit-live-preview").click();
  previewTracking = false;
  await p.evaluate((config) => {
    localStorage.setItem(
      "dorm-create-experience-v2",
      JSON.stringify({
        at: Date.now(),
        draft: {
          ...config,
          tasks: config.tasks.map((t) => ({
            ...t,
            enabled: t.page === "duty" || t.key === "water",
          })),
          name: "单任务",
          nickname: "创建者",
          members: [],
        },
      }),
    );
  }, config);
  await p.goto(base + "/?preview=new-dorm");
  await p.getByRole("button", { name: "预览", exact: true }).click();
  await p.getByTestId("live-draft-preview").getByTestId("pane-duty").waitFor();
  await selectPage(p.getByTestId("live-draft-preview"), "water");
  check(
    (await p.locator(".new-task-pane .task-selector").count()) === 0 &&
      (await p.locator(".new-task-pane article").count()) === 1,
    "single-task second page retains its body without redundant task tabs",
  );
  check(
    previewRequests.length === 0,
    "preview task/page/detail actions issue no fetch or XHR",
  );
  check(writes.length === 0, "preview interactions create no business writes");
  check(
    legacySnapshot() === beforeLegacy,
    "all old-room table rows remain byte-identical in isolated SQLite",
  );
  check(errors.length === 0, "no browser runtime errors");
  await fs.writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        engine,
        checks,
        errors,
        previewRequests,
        writes,
        liveDuty,
        previewDuty,
        liveWater,
        previewWater,
        physicalDevices: "not tested",
      },
      null,
      2,
    ),
  );
} catch (e) {
  await p.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw e;
} finally {
  const video = p.video();
  await context.close();
  if (video) await fs.copyFile(await video.path(), `${out}/navigation.webm`);
  await b.close();
  h.close();
}

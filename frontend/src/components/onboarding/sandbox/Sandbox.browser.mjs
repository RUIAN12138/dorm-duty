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
const out = `data/draft-sandbox/${engine}`;
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
const draft = {
  schema_version: 2,
  name: "草稿操作",
  nickname: "创建者",
  members: [],
  policy: "soft",
  pages: [
    { id: "duty", label: "值日" },
    { id: "water", label: "催促" },
    { id: "calendar", label: "日历" },
  ],
  tasks: [
    {
      key: "floor",
      name: "地板",
      content: "扫地拖地",
      enabled: true,
      page: "duty",
      rotation: "round",
      display: "title",
      deadline: "22:00",
      execution_time: "09:00",
      interval: 3,
    },
    {
      key: "water",
      name: "抬水",
      content: "饮用水",
      enabled: true,
      page: "water",
      rotation: "completion",
      display: "title",
      deadline: "20:00",
      execution_time: "09:00",
      interval: 3,
    },
  ],
};
await p.addInitScript((draft) => {
  localStorage.setItem(
    "dorm-create-experience-v2",
    JSON.stringify({ at: Date.now(), draft }),
  );
}, draft);
async function nav(section) {
  await p
    .getByTestId("live-draft-preview")
    .locator(`.chore-bottom-nav [data-section=${section}]`)
    .click();
  await p.getByTestId(`pane-${section}`).waitFor();
}
async function captureCoach(file, title) {
  await p.getByRole("heading", { name: title, exact: true }).waitFor();
  await p.waitForFunction(
    () =>
      !document.querySelector(
        ".practice-coach .practice-copy-enter-active,.practice-coach .practice-copy-leave-active",
      ),
  );
  await p.screenshot({ path: out + "/" + file });
}
async function settled() {
  await p.waitForFunction(
    () =>
      !document
        .querySelector(".live-preview .board-focus")
        ?.getAnimations({ subtree: true })
        .some(
          (a) =>
            a.playState === "running" &&
            a.effect?.getTiming().iterations !== Infinity,
        ),
  );
}
const dbSnapshot = () =>
  JSON.stringify(
    h.db.sqlite
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map(({ name }) => [
        name,
        h.db.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
      ]),
  );
try {
  await p.goto(base + "/?preview=new-dorm");
  await p.locator(".dorm-wizard").waitFor();
  await p.waitForLoadState("networkidle");
  const beforeDb = dbSnapshot();
  tracking = true;
  await p.getByRole("button", { name: "预览", exact: true }).click();
  const preview = p.getByTestId("live-draft-preview");
  await preview.getByTestId("pane-duty").waitFor();
  await settled();
  check(
    (await preview.locator(".identity-name").innerText()).includes("草稿操作"),
    "preview uses draft identity and the real board",
  );
  const button = preview.locator("[data-testid^=complete-floor-]");
  const id = (await button.getAttribute("data-testid")).slice(
    "complete-floor-".length,
  );
  await button.click();
  await preview.getByTestId(`undo-${id}`).waitFor();
  check(true, "real completion button accepts a local receipt");
  await preview.getByTestId("round-progress").click();
  await p.getByTestId("round-members").waitFor();
  check(
    (await p.getByTestId("round-members").innerText()).includes("甲"),
    "round sheet reflects simulated completion",
  );
  await p.getByRole("button", { name: "关闭详情", exact: true }).click();
  await nav("calendar");
  await p.getByTestId("calendar-view-list").click();
  await p.locator("[data-calendar-panel=list][aria-hidden=false]").waitFor();
  check(
    (await p.locator("[data-calendar-panel=list]").innerText()).includes("甲"),
    "calendar list contains the new simulated completion",
  );
  await p.waitForFunction(() =>
    [
      ...document.querySelectorAll(
        ".live-preview .calendar-pane [data-calendar-panel=list],.live-preview .calendar-pane header",
      ),
    ].every((el) => Number(getComputedStyle(el).opacity) > 0.98),
  );
  await settled();
  await p.screenshot({ path: out + "/completed-calendar.png" });
  await nav("duty");
  await preview.getByTestId(`undo-${id}`).waitFor();
  await settled();
  await preview.getByTestId(`undo-${id}`).click();
  await preview.locator("[data-testid^=complete-floor-]").waitFor();
  await nav("calendar");
  await p.getByTestId("calendar-view-list").click();
  await p.locator("[data-calendar-panel=list][aria-hidden=false]").waitFor();
  check(
    !(await p.locator("[data-calendar-panel=list]").innerText()).includes("甲"),
    "undo removes the exact completion from the calendar",
  );
  await nav("duty");
  await preview.locator("[data-testid^=complete-floor-]").click();
  await preview.getByTestId(`undo-${id}`).waitFor();
  await preview.getByTestId("exit-live-preview").click();
  await p.getByRole("button", { name: "预览", exact: true }).click();
  await preview.getByTestId(`undo-${id}`).waitFor();
  check(true, "exit and reopen retain simulated task history");
  const navEl = preview.getByTestId("chore-bottom-nav"),
    from = await navEl.locator("[data-section=duty]").boundingBox(),
    to = await navEl.locator("[data-section=calendar]").boundingBox();
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p.mouse.down();
  await navEl.locator("xpath=.").evaluate(() => {});
  await p.waitForFunction(() =>
    document
      .querySelector(".live-preview .chore-bottom-nav")
      ?.classList.contains("is-dragging"),
  );
  await p.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await p.mouse.up();
  const stored = await p.evaluate(() =>
    JSON.parse(
      localStorage.getItem("dorm-create-experience-v2"),
    ).draft.pages.map((p) => p.id),
  );
  check(
    stored.at(-1) === "duty",
    "long-press navigation reorder writes the draft order",
  );
  await nav("duty");
  check(
    (await preview.getByTestId(`undo-${id}`).count()) === 1,
    "reordering navigation does not reset task state",
  );
  await nav("water");
  const waterButton = preview.locator("[data-testid^=complete-water-]");
  const waterId = (await waterButton.getAttribute("data-testid")).slice(
    "complete-water-".length,
  );
  await waterButton.click();
  await preview.getByTestId(`undo-${waterId}`).waitFor();
  await preview
    .getByRole("button", { name: "敲一敲室友二，催促抬水", exact: true })
    .waitFor();
  check(true, "water completion hands off to the next simulated roommate");
  await settled();
  await preview
    .getByRole("button", { name: "敲一敲室友二，催促抬水", exact: true })
    .click();
  check(
    (await preview.locator(".nudge-status").innerText()).includes("未发送"),
    "nudge is simulated and explicitly labeled",
  );
  await preview.getByTestId(`undo-${waterId}`).click();
  await preview.locator("[data-testid^=complete-water-]").waitFor();
  check(true, "water undo restores original turn through the real UI");
  await preview.locator(".companion-identity .companion-frame").click();
  await p.locator(".companion-chat").waitFor();
  await p.getByText("这是草稿预览，不连接真实AI。", { exact: true }).waitFor();
  check(true, "chat uses explicit local-only provider");
  await p
    .getByTestId("chat-quick-prompts")
    .getByRole("button", { name: "我要留言", exact: true })
    .click();
  await p
    .locator(".conversation-recipients")
    .getByRole("button", { name: "室友二", exact: true })
    .click();
  const input = p.getByRole("textbox", { name: "和球球说句话", exact: true });
  await input.click();
  await input.fill("预览留言测试");
  await p.getByRole("button", { name: "发送消息", exact: true }).click();
  await p.getByTestId("note-confirm").click();
  await p.getByText("预览留言已模拟，未通知室友。", { exact: true }).waitFor();
  check(
    true,
    "confirmation runs the local note flow without claiming real delivery",
  );
  await p.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await p.locator(".companion-chat").waitFor({ state: "hidden" });
  check(
    requests.length === 0,
    "complete, undo, calendar, navigation, nudge and chat issue no business requests",
  );
  check(
    dbSnapshot() === beforeDb,
    "all fixture database rows remain byte-for-byte unchanged during preview",
  );
  check(errors.length === 0, "no uncaught runtime errors");
  await p.screenshot({ path: out + "/preview.png" });
  tracking = false;
  await p.goto(base + "/guide?practice=1");
  await p.getByTestId("lesson-duty").waitFor();
  await p.waitForLoadState("networkidle");
  tracking = true;
  requests.length = 0;
  const tutorialDb = dbSnapshot();
  const at = async (id) =>
    p.waitForFunction(
      (id) =>
        document.querySelector("[data-testid=practice-coach]")?.dataset.step ===
        id,
      id,
    );
  const closeSheet = () =>
    p.getByRole("button", { name: "关闭详情", exact: true }).click();
  await p.getByTestId("lesson-duty").click();
  await at("duty-select");
  await p.locator(".task-selector button:nth-child(2)").click();
  await at("duty-detail");
  await captureCoach("tutorial-duty.png", "点任务名，看具体要做什么");
  await p
    .locator(".task-title-stage h2:not([inert]) .task-title-button")
    .click();
  await at("duty-detail-close");
  await closeSheet();
  await at("duty-complete");
  await p.getByTestId("complete-sink--11").click();
  await at("duty-round");
  await p.getByTestId("round-progress").click();
  await at("duty-pending");
  await p.locator(".round-filters button:nth-child(2)").click();
  await at("duty-round-close");
  await closeSheet();
  await at("duty-undo");
  await p.getByTestId("undo--11").click();
  await p.getByTestId("lesson-duty").waitFor();
  check(
    (await p.getByTestId("lesson-duty").innerText()).includes("已练习"),
    "duty lesson advances after real selection, details, completion, round and undo actions",
  );
  await p.getByTestId("lesson-water").click();
  await at("water-nav");
  await p.getByTestId("nav-water").click();
  await at("water-detail");
  await p.locator(".water-task-text").click();
  await at("water-detail-close");
  await closeSheet();
  await at("water-complete");
  await p.getByTestId("complete-water--13").click();
  await at("water-nudge");
  await p
    .locator(".nudge-title:not([inert]) [data-testid=water-nudge]")
    .click();
  await at("water-swipe");
  await settled();
  await captureCoach("tutorial-water.png", "向左滑动大字，换一个任务");
  const swipe = await p.getByTestId("nudge-task-swipe").boundingBox();
  await p.mouse.move(swipe.x + swipe.width / 2, swipe.y + swipe.height / 2);
  await p.mouse.down();
  await p.mouse.move(
    swipe.x + swipe.width / 2 - 110,
    swipe.y + swipe.height / 2,
    { steps: 10 },
  );
  await p.mouse.up();
  await p.getByTestId("lesson-water").waitFor();
  check(
    (await p.getByTestId("lesson-water").innerText()).includes("已练习"),
    "water lesson advances after real handoff, nudge and swipe",
  );
  await p.getByTestId("lesson-calendar").click();
  await at("calendar-nav");
  await p.getByTestId("nav-calendar").click();
  await at("calendar-date");
  await captureCoach("tutorial-calendar.png", "点今天，查看当天记录");
  await p.locator("[data-testid^=calendar-day-].is-today").click();
  await at("calendar-close");
  await closeSheet();
  await at("calendar-list");
  await p.getByTestId("calendar-view-list").click();
  await at("calendar-stats");
  await p.getByTestId("calendar-view-stats").click();
  await p.getByTestId("lesson-calendar").waitFor();
  check(
    (await p.getByTestId("lesson-calendar").innerText()).includes("已练习"),
    "calendar lesson advances after opening a date, list and cards",
  );
  await p.getByTestId("lesson-messages").click();
  await at("message-ball");
  await p.locator(".companion-identity .companion-frame").click();
  await at("message-start");
  await p
    .getByTestId("chat-quick-prompts")
    .getByRole("button", { name: "我要留言", exact: true })
    .click();
  await at("message-recipient");
  await p
    .locator(".conversation-recipients")
    .getByRole("button", { name: "小林", exact: true })
    .click();
  await at("message-content");
  const tutorialInput = p.getByRole("textbox", {
    name: "和球球说句话",
    exact: true,
  });
  await tutorialInput.click();
  await tutorialInput.fill("晚点回来，我会记得值日。");
  await p.getByRole("button", { name: "发送消息", exact: true }).click();
  await at("message-confirm");
  await captureCoach("tutorial-confirm.png", "检查后，点「确认发送」");
  await p.getByTestId("note-confirm").click();
  await at("message-back");
  await p.getByRole("button", { name: "返回宿舍", exact: true }).click();
  await at("message-tools");
  await p.getByTestId("open-tools").click();
  await at("message-inbox");
  await p.getByTestId("open-messages").click();
  await at("message-read");
  await p.getByTestId("reminder-read--50").click();
  await p.getByTestId("lesson-messages").waitFor();
  check(
    (await p.getByTestId("lesson-messages").innerText()).includes("已练习"),
    "messages lesson advances after recipient, content, confirmation, inbox and exact read actions",
  );
  check(
    requests.length === 0,
    "all four tutorial chapters issue no business requests",
  );
  check(
    dbSnapshot() === tutorialDb,
    "tutorial leaves all fixture database rows unchanged",
  );
  check(errors.length === 0, "tutorial has no uncaught runtime errors");

  const report = { status: "passed", engine, checks, requests, errors };
  await fs.writeFile(out + "/results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await p.screenshot({ path: out + "/failure.png" });
  throw error;
} finally {
  await context.close();
  await b.close();
  h.close();
}

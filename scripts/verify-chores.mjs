import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../frontend/node_modules/@playwright/test/index.mjs";

// The server, browser profiles and database below are disposable. This script
// never connects to the normal local-service port or the real user database.
const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-chores-qa-"));
const evidence = path.join(root, "docs/evidence/ui-focus/regression");
const database = path.join(temporary, "chores.sqlite");
const checks = [],
  issues = [],
  secrets = [];
let service,
  browser,
  origin,
  phase = "start";
function safe(value) {
  let text = String(value);
  for (const secret of secrets) text = text.split(secret).join("[redacted]");
  return text
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .split("\n")[0]
    .slice(0, 500);
}
async function start(port = 0) {
  const child = spawn(process.execPath, ["scripts/local-server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      DORM_LOCAL_DATABASE: database,
      DORM_LOCAL_HOST: "127.0.0.1",
      DORM_LOCAL_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  service = {
    child,
    exited: new Promise((resolve) => child.once("exit", resolve)),
  };
  let output = "",
    errors = "";
  try {
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Local server not ready in 30 seconds")),
        30000,
      );
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.stderr.on("data", (data) => {
        errors = (errors + data).slice(-1500);
      });
      child.stdout.on("data", (data) => {
        output = (output + data).slice(-4000);
        const match = output.match(/^LOCAL_READY\s+(\{[^\n]+\})/m);
        if (!match) return;
        clearTimeout(timer);
        resolve(JSON.parse(match[1]));
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Local server exited ${code}: ${safe(errors)}`));
      });
    });
    assert.equal(ready.persistent, true);
    assert(Number.isInteger(ready.port) && ready.port > 0);
    return new URL(ready.url).origin;
  } catch (error) {
    await stop();
    throw error;
  }
}
async function stop() {
  if (!service) return;
  const owned = service;
  service = null;
  if (owned.child.exitCode === null && owned.child.signalCode === null)
    owned.child.kill("SIGTERM");
  let timer;
  await Promise.race([
    owned.exited,
    new Promise((resolve) => {
      timer = setTimeout(() => {
        owned.child.kill("SIGKILL");
        resolve();
      }, 5000);
    }),
  ]);
  clearTimeout(timer);
  await owned.exited;
}
async function api(route, { method = "GET", token, data, status = 200 } = {}) {
  const response = await fetch(new URL(route, origin), {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(
    response.status,
    status,
    `${route.split("?")[0]} unexpected HTTP status`,
  );
  assert(/no-store/i.test(response.headers.get("cache-control") || ""));
  return response.json();
}
async function phone(width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  page.on("pageerror", (error) => issues.push(safe(error.message)));
  return { context, page };
}
async function fit(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert(
    dimensions.document <= dimensions.viewport &&
      dimensions.body <= dimensions.viewport,
    `${label} horizontal overflow: ${JSON.stringify(dimensions)}`,
  );
}
async function snapshot(page, name) {
  await fit(page, name);
  await page.screenshot({
    path: path.join(evidence, `${name}.jpg`),
    type: "jpeg",
    quality: 85,
    fullPage: true,
  });
}
const panes = {
  duty: { path: "/", selector: '[data-testid="pane-duty"]' },
  water: { path: "/water", selector: '[data-testid="pane-water"]' },
  calendar: { path: "/calendar", selector: '[data-testid="pane-calendar"]' },
};
async function noNavigation(page) {
  for (const key of Object.keys(panes))
    assert.equal(await page.getByTestId(`nav-${key}`).count(), 0);
}
async function identity(page) {
  return page.evaluate(() => ({
    choice: localStorage.getItem("dorm-guest-view-v1"),
    owner: localStorage.getItem("dorm-owner-token"),
    credentials: Object.keys(localStorage)
      .filter((key) => key.startsWith("dorm-chore-device-v1:"))
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
  }));
}
async function openMenu(page) {
  await page.getByTestId("open-tools").click();
  await page.getByRole("dialog", { name: "宿舍操作", exact: true }).waitFor();
}
async function closeMenu(page) {
  const menu = page.getByRole("dialog", { name: "宿舍操作", exact: true });
  await menu.getByRole("button", { name: "关闭详情", exact: true }).click();
  await menu.waitFor({ state: "hidden" });
}
async function openTool(page, id) {
  await openMenu(page);
  await page.getByTestId(id).click();
  const title = {
    "open-reminder": "提醒一位室友",
    "open-messages": "室友消息",
    "open-chore-settings": "宿舍任务设置",
  }[id];
  if (title)
    await page.getByRole("dialog", { name: title, exact: true }).waitFor();
}
async function pane(page, key) {
  const wanted = panes[key];
  await page.waitForURL((url) => url.pathname === wanted.path);
  await page.locator(wanted.selector).waitFor();
  await page
    .locator('.focus-pane[aria-hidden="true"]')
    .waitFor({ state: "detached" });
  for (const [name, item] of Object.entries(panes)) {
    assert.equal(
      await page.locator(item.selector).count(),
      name === key ? 1 : 0,
    );
    const tab = page.getByTestId(`nav-${name}`);
    assert.equal(await tab.count(), 1);
    const bounds = await tab.boundingBox();
    const viewport = page.viewportSize();
    assert(
      bounds &&
        bounds.y >= viewport.height - 160 &&
        bounds.y + bounds.height <= viewport.height,
      `${name} bottom navigation must remain within the mobile viewport`,
    );
    assert.equal(
      new URL(await tab.getAttribute("href"), origin).pathname,
      item.path,
    );
    assert.equal(
      await tab.getAttribute("aria-current"),
      name === key ? "page" : null,
    );
  }
  assert.equal(
    await page.locator(".chore-personal").count(),
    key === "duty" ? 1 : 0,
  );
  assert.equal(
    await page.getByTestId("water-task").count(),
    key === "water" ? 1 : 0,
  );
  assert.equal(
    await page.getByTestId("chore-calendar").count(),
    key === "calendar" ? 1 : 0,
  );
  await openMenu(page);
  assert.equal(
    await page.getByTestId("open-reminder").count(),
    key === "calendar" ? 0 : 1,
  );
  assert.equal(await page.getByTestId("open-messages").count(), 1);
  await closeMenu(page);
}
async function navigate(page, key) {
  await page.getByTestId(`nav-${key}`).click();
  await pane(page, key);
}
async function stableIdentity(page, before) {
  const after = await identity(page);
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    "navigation must preserve the selected member and device credentials",
  );
}
async function pageMatrix(page, role) {
  const before = await identity(page);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const key of Object.keys(panes)) {
      await navigate(page, key);
      await openMenu(page);
      assert.equal(
        await page.getByTestId("open-chore-settings").count(),
        role === "creator" && key !== "calendar" ? 1 : 0,
      );
      await closeMenu(page);
      await stableIdentity(page, before);
      await snapshot(page, `${role}-${key}-${width}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "duty");
  await navigate(page, "water");
  await navigate(page, "calendar");
  for (const [operation, key] of [
    ["goBack", "water"],
    ["goBack", "duty"],
    ["goForward", "water"],
    ["goForward", "calendar"],
  ]) {
    await page[operation]();
    await pane(page, key);
    await stableIdentity(page, before);
  }
  for (const key of ["water", "calendar"]) {
    await page.goto(origin + panes[key].path);
    await pane(page, key);
    await page.reload();
    await pane(page, key);
    await stableIdentity(page, before);
  }
  await navigate(page, "duty");
  await stableIdentity(page, before);
}
async function join(page, code, userId, mark) {
  await page.goto(origin + "/");
  await page.getByTestId("guest-join-dorm").click();
  await page.getByTestId("guest-invite").fill(code);
  await page.getByTestId("guest-join-submit").click();
  await page.getByTestId(`guest-member-${userId}`).waitFor();
  await noNavigation(page);
  await page.getByTestId(`guest-member-${userId}`).click();
  await noNavigation(page);
  await page.getByTestId(`marker-${mark}`).click();
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/chores/claim" &&
      r.request().method() === "POST",
  );
  await page.getByTestId("marker-confirm").click();
  const result = await (await response).json();
  secrets.push(result.access_token);
  await pane(page, "duty");
  return result.access_token;
}
async function complete(page, task) {
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/chores/tasks/${task.id}/complete` &&
      r.request().method() === "PATCH",
  );
  await page.getByTestId(`complete-${task.key}-${task.id}`).click();
  const actual = await response;
  assert.equal(actual.status(), 200);
  const body = await actual.json();
  assert.equal(body.task.status, "completed");
  return body;
}
const result = {
  date: new Date().toISOString(),
  workerBundleSha256: createHash("sha256")
    .update(await fs.readFile(path.join(root, "site/worker/index.js")))
    .digest("hex"),
  runtime: "Node HTTP server and temporary persistent SQLite database",
  browser: "Chrome headless mobile emulation; two independent browser profiles",
  physicalIphone: "not tested",
  cloudD1: "not tested",
};
try {
  await fs.mkdir(evidence, { recursive: true });
  origin = await start();
  const port = Number(new URL(origin).port);
  const health = await api("/health");
  assert.equal(health.storage, "sqlite");
  assert.equal(health.persistent, true);
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.BROWSER_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  for (const width of [320, 390, 430]) {
    const entry = await phone(width);
    await entry.page.goto(origin + "/");
    await entry.page.getByTestId("guest-create-dorm").waitFor();
    await noNavigation(entry.page);
    await snapshot(entry.page, `entry-${width}`);
    await entry.context.close();
  }
  checks.push(
    "entry layout has no horizontal overflow at 320, 390 and 430 pixels and has no bottom navigation before member selection",
  );
  phase = "create_and_mark";
  const a = await phone(390),
    b = await phone(390);
  await a.page.goto(origin + "/");
  await a.page.getByTestId("guest-create-dorm").click();
  await noNavigation(a.page);
  await a.page.getByTestId("guest-create-name").fill("三项值日手机验收");
  await a.page.getByTestId("guest-create-nickname").fill("创建者");
  await a.page.getByTestId("guest-create-members").fill("室友甲\n室友乙");
  await a.page.getByTestId("marker-pixel-10").click();
  await snapshot(a.page, "create-marker-390");
  const creationResponse = a.page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/guest/create" &&
      r.request().method() === "POST",
  );
  await a.page.getByTestId("guest-create-submit").click();
  const created = await (await creationResponse).json();
  const ownerToken = created.access_token;
  secrets.push(ownerToken);
  const ownerId = created.member_id;
  const otherId = created.dorm.members.find(
    (m) => m.user_id !== ownerId,
  ).user_id;
  if (await a.page.getByTestId(`guest-member-${ownerId}`).count()) {
    await a.page.getByTestId(`guest-member-${ownerId}`).click();
    if (await a.page.getByTestId("marker-confirm").count())
      await a.page.getByTestId("marker-confirm").click();
  }
  await pane(a.page, "duty");
  const memberToken = await join(
    b.page,
    created.invite_code,
    otherId,
    "pixel-11",
  );
  const board = (id, token) =>
    api(`/chores/board?invite_code=${created.invite_code}&member_id=${id}`, {
      token,
    });
  let ownerBoard = await board(ownerId, ownerToken),
    memberBoard = await board(otherId, memberToken);
  assert.equal(ownerBoard.is_creator, true);
  assert.equal(memberBoard.is_creator, false);
  assert.equal(ownerBoard.member.marker_id, "pixel-10");
  assert.equal(memberBoard.member.marker_id, "pixel-11");
  await api("/dorms/current", { token: memberToken, status: 401 });
  await openMenu(b.page);
  assert.equal(await b.page.getByTestId("open-chore-settings").count(), 0);
  await closeMenu(b.page);
  await openTool(a.page, "open-chore-settings");
  assert.equal(
    await a.page
      .getByRole("link", { name: "宿舍成员管理", exact: true })
      .getAttribute("href"),
    "/dorm",
  );
  assert.equal(
    await b.page
      .getByRole("link", { name: "宿舍成员管理", exact: true })
      .count(),
    0,
  );
  await a.page
    .getByRole("dialog", { name: "宿舍任务设置" })
    .getByRole("button", { name: "关闭详情", exact: true })
    .click();
  await a.page.getByTestId("chore-settings").waitFor({ state: "hidden" });
  checks.push(
    "creator creates without password and selects a mark; second browser joins through invite and receives a scoped member identity",
    "creator footer links to dorm member management; ordinary member has no creator management link",
    "room entry and member/mark chooser hide the bottom navigation until a member is selected",
  );
  phase = "three_page_navigation";
  await pageMatrix(a.page, "creator");
  await pageMatrix(b.page, "member");
  checks.push(
    "creator and member each have isolated duty, water and calendar pages without horizontal overflow at 320, 390 and 430 pixels",
    "tab changes, browser back/forward and direct water/calendar reloads keep both browser identities and device credentials",
  );
  phase = "reminder";
  const floor = ownerBoard.today_tasks.find((t) => t.key === "floor");
  assert(floor, "creator must have initial floor task");
  await openTool(b.page, "open-reminder");
  await b.page.getByTestId(`reminder-member-${ownerId}`).click();
  await b.page.getByTestId(`reminder-task-${floor.id}`).click();
  const reminderResponse = b.page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/chores/remind" &&
      r.request().method() === "POST",
  );
  await b.page.getByTestId("reminder-submit").click();
  const sent = await reminderResponse;
  assert.equal(sent.status(), 201);
  const reminder = await sent.json();
  await a.page.reload();
  await pane(a.page, "duty");
  await openTool(a.page, "open-messages");
  await a.page.getByTestId(`reminder-read-${reminder.id}`).waitFor();
  await snapshot(a.page, "received-reminder-390");
  const readResponse = a.page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/chores/reminders/${reminder.id}/read` &&
      r.request().method() === "PATCH",
  );
  await a.page.getByTestId(`reminder-read-${reminder.id}`).click();
  assert.equal((await readResponse).status(), 200);
  await a.page.getByTestId("messages-close").click();
  await a.page.getByTestId("chore-reminders").waitFor({ state: "hidden" });
  ownerBoard = await board(ownerId, ownerToken);
  assert(ownerBoard.reminders.find((n) => n.id === reminder.id)?.read_at);
  checks.push(
    "member selects a particular roommate and task; recipient sees the in-app reminder and marks it read",
  );
  phase = "complete_categories_calendar";
  await complete(a.page, floor);
  ownerBoard = await board(ownerId, ownerToken);
  await navigate(a.page, "water");
  await complete(a.page, ownerBoard.water_task);
  await b.page.reload();
  await pane(b.page, "duty");
  memberBoard = await board(otherId, memberToken);
  const toilet = memberBoard.today_tasks.find((t) => t.key === "toilet");
  assert(toilet, "second member must have initial toilet task");
  await complete(b.page, toilet);
  await navigate(b.page, "water");
  await complete(b.page, memberBoard.water_task);
  await a.page.reload();
  await pane(a.page, "water");
  await navigate(a.page, "calendar");
  ownerBoard = await board(ownerId, ownerToken);
  assert.equal(ownerBoard.calendar.length, 4);
  const day = a.page.getByTestId(`calendar-day-${ownerBoard.today}`);
  await day.click();
  const details = a.page.getByTestId("calendar-day-details");
  assert.equal(await details.locator(".calendar-record").count(), 4);
  assert.equal(await day.locator(".member-mark").count(), 2);
  assert.match(await details.textContent(), /创建者/);
  assert.match(await details.textContent(), /室友甲/);
  await snapshot(a.page, "calendar-completed-390");
  for (const width of [320, 430]) {
    await a.page.setViewportSize({ width, height: 844 });
    await snapshot(a.page, `board-completed-${width}`);
  }
  await a.page.setViewportSize({ width: 390, height: 844 });
  await a.page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭详情", exact: true })
    .click();
  await details.waitFor({ state: "hidden" });
  for (const key of Object.keys(panes)) {
    await navigate(a.page, key);
    await snapshot(a.page, `completed-${key}-390`);
  }
  checks.push(
    "floor, toilet and two successive water turns record server completion times and show both personal marks with four calendar detail rows",
  );
  phase = "customize";
  await navigate(a.page, "duty");
  await openTool(a.page, "open-chore-settings");
  await a.page
    .getByTestId("settings-content-floor")
    .fill("地板：先扫再拖，床下也要清洁");
  await a.page.getByTestId("settings-time-floor").fill("20:15");
  await a.page
    .getByTestId("settings-content-toilet")
    .fill("厕所：刷洗便池、台面和地漏");
  await a.page.getByTestId("settings-time-toilet").fill("21:20");
  await a.page
    .getByTestId("settings-content-water")
    .fill("抬水：从一楼运一桶饮用水");
  await a.page.getByTestId("settings-time-water").fill("18:35");
  await a.page.getByTestId("settings-rotation-floor").fill("2");
  await a.page.getByTestId(`order-up-water-${otherId}`).click();
  await snapshot(a.page, "custom-settings-390");
  const settingsResponse = a.page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/chores/settings" &&
      r.request().method() === "PATCH",
  );
  await a.page.getByTestId("settings-save").click();
  assert.equal((await settingsResponse).status(), 200);
  const customized = await board(ownerId, ownerToken);
  const expected = {
    floor: ["地板：先扫再拖，床下也要清洁", "20:15"],
    toilet: ["厕所：刷洗便池、台面和地漏", "21:20"],
    water: ["抬水：从一楼运一桶饮用水", "18:35"],
  };
  for (const category of customized.categories)
    assert.deepEqual(
      [category.content, category.deadline_time],
      expected[category.key],
    );
  assert.equal(
    customized.categories.find((c) => c.key === "floor").rotation_days,
    2,
  );
  assert.equal(
    customized.categories.find((c) => c.key === "water").rotation_order[0],
    otherId,
  );
  assert.deepEqual(customized.calendar, ownerBoard.calendar);
  checks.push(
    "creator changes the content and time of all three categories, adjusts continuity/order, and keeps completed calendar history",
  );
  phase = "restart";
  await stop();
  origin = await start(port);
  await a.page.reload();
  await b.page.reload();
  await pane(a.page, "duty");
  await pane(b.page, "water");
  const restored = await board(ownerId, ownerToken);
  assert.deepEqual(restored.calendar, customized.calendar);
  assert.deepEqual(restored.categories, customized.categories);
  assert.equal(restored.water_task.id, customized.water_task.id);
  assert.equal(restored.member.marker_id, "pixel-10");
  assert.equal(
    (await board(otherId, memberToken)).member.marker_id,
    "pixel-11",
  );
  await snapshot(a.page, "restored-after-restart-390");
  for (const key of Object.keys(panes)) {
    await navigate(a.page, key);
    if (key === "calendar") {
      await a.page.getByTestId(`calendar-day-${restored.today}`).click();
      assert.equal(
        await a.page
          .getByTestId("calendar-day-details")
          .locator(".calendar-record")
          .count(),
        4,
      );
    }
    await snapshot(a.page, `final-${key}-390`);
    if (key === "calendar") {
      await a.page.evaluate(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "instant",
        });
      });
      const navigation = await a.page
        .getByTestId("chore-bottom-nav")
        .boundingBox();
      for (const record of await a.page.locator(".calendar-record").all()) {
        const bounds = await record.boundingBox();
        assert(
          bounds && bounds.y >= 0 && bounds.y + bounds.height <= navigation.y,
          "all completion rows must be reachable above the fixed bottom navigation",
        );
      }
      await a.page.screenshot({
        path: path.join(evidence, "final-calendar-records-390.jpg"),
        type: "jpeg",
        quality: 85,
        fullPage: false,
      });
    }
  }
  checks.push(
    "restart of the temporary persistent server restores custom rules, water turn, member marks and completed records in both browser contexts",
    "calendar detail rows remain reachable by scrolling above the fixed bottom navigation",
  );
  assert.deepEqual(issues, [], "browser JavaScript errors");
  Object.assign(result, {
    status: "passed",
    checks,
    browserErrors: issues,
    restarts: 1,
    database: "temporary SQLite file removed after verification",
  });
} catch (error) {
  Object.assign(result, {
    status: "failed",
    phase,
    reason: safe(error),
    checks,
    browserErrors: issues,
  });
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stop();
  await fs.rm(temporary, { recursive: true, force: true });
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(
    path.join(evidence, "mobile.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
}

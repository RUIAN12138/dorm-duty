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
  diagnosticPage,
  phase = "start",
  navigationStep = "";
let expectedPane = "none";
function safe(value) {
  let text = String(value);
  for (const secret of secrets) text = text.split(secret).join("[redacted]");
  return text
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/\s*\n\s*/g, " / ")
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
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll(".sheet-layer")].some((el) =>
        ["opening", "closing"].includes(el.getAttribute("data-phase")),
      ),
  );
  await page.waitForTimeout(100);
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
  diagnosticPage = page;
  await page.getByTestId("open-tools").click();
  await page.getByTestId("open-reminder").waitFor();
  assert.equal(
    await page
      .locator(".app-shell")
      .evaluate((el) => getComputedStyle(el).transform),
    "none",
    "opening sheets does not shrink the underlying page",
  );
}
async function closeMenu(page) {
  const menu = page.locator(".elastic-sheet");
  await menu.getByRole("button", { name: "关闭详情", exact: true }).click();
  await menu.waitFor({ state: "hidden" });
}
async function closePresentedReminder(page) {
  const panel = page.getByTestId("chore-reminders");
  if (!(await panel.isVisible().catch(() => false))) return;
  const read = panel.locator('[data-testid^="reminder-read-"]').first();
  if (await read.count()) {
    const testId = await read.getAttribute("data-testid");
    const id = Number(testId?.slice("reminder-read-".length));
    const response = page
      .waitForResponse(
        (r) =>
          new URL(r.url()).pathname === `/chores/reminders/${id}/read` &&
          r.request().method() === "PATCH",
      )
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await read.click();
    const result = await response;
    if (result.error) throw result.error;
    assert.equal(result.value.status(), 200);
  }
  await page.getByTestId("messages-close").click();
  await panel.waitFor({ state: "hidden" });
}
async function openTool(page, id) {
  await openMenu(page);
  if (!(await page.getByTestId(id).count()))
    await page.getByTestId("open-preferences").click();
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
  expectedPane = key;
  await page.waitForFunction(
    (path) => window.location.pathname === path,
    wanted.path,
  );
  await page.locator(wanted.selector).waitFor();
  await page
    .locator('.focus-pane[aria-hidden="true"]')
    .waitFor({ state: "detached" });
  for (const [name, item] of Object.entries(panes)) {
    assert.equal(
      await page.locator(item.selector).count(),
      name === key ? 1 : 0,
      `${key} page content is isolated while showing ${name}`,
    );
    const tab = page.getByTestId(`nav-${name}`);
    assert.equal(await tab.count(), 1, `${name} navigation tab exists`);
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
      `${name} navigation target is correct`,
    );
    assert.equal(
      await tab.getAttribute("aria-current"),
      name === key ? "page" : null,
      `${name} active tab matches ${key} page`,
    );
  }
  assert.equal(
    await page.locator(".chore-personal").count(),
    key === "duty" ? 1 : 0,
    `duty content visibility on ${key}`,
  );
  assert.equal(
    await page.getByTestId("water-task").count(),
    key === "water" ? 1 : 0,
    `water content visibility on ${key}`,
  );
  assert.equal(
    await page.getByTestId("chore-calendar").count(),
    key === "calendar" ? 1 : 0,
    `calendar content visibility on ${key}`,
  );
  await openMenu(page);
  assert.equal(
    await page.getByTestId("open-reminder").count(),
    1,
    `reminder action visibility on ${key}`,
  );
  assert.equal(
    await page.getByTestId("open-messages").count(),
    1,
    `message action remains available on ${key}`,
  );
  await closeMenu(page);
}
const checkedReveal = new WeakSet();
async function navigate(page, key) {
  expectedPane = key;
  navigationStep = `tap-navigation:${key}`;
  const inspectReveal =
    !checkedReveal.has(page) &&
    (await page.evaluate(() => location.pathname)) !== panes[key].path;
  if (inspectReveal)
    await page.evaluate(() => {
      window.__revealSeen = false;
      const start = performance.now();
      function sample() {
        window.__revealSeen ||= document
          .getAnimations()
          .some(
            (a) =>
              a.effect?.target?.classList?.contains("focus-pane") &&
              a.effect
                .getKeyframes()
                .some((k) => k.opacity !== undefined && Number(k.opacity) < 1),
          );
        if (performance.now() - start < 600) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  await page.getByTestId(`nav-${key}`).tap();
  await pane(page, key);
  if (inspectReveal) {
    await page.waitForFunction(() => window.__revealSeen);
    checkedReveal.add(page);
    checks.push(
      "tapping a page tab crossfades without translating or clipping its content",
    );
  }
}
async function swipeSection(page, deltaX) {
  navigationStep = `heading-swipe:${deltaX}`;
  const title = page.getByTestId("page-swipe-title");
  const bounds = await title.boundingBox();
  assert(bounds, "page heading should be visible for horizontal navigation");
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y, { steps: 8 });
  await page.mouse.up();
}
async function swipeBlank(page, dx, hold = 0) {
  const point = await page.locator(".board-focus").evaluate((el) => {
    const b = el.getBoundingClientRect();
    for (
      let y = b.top + 35;
      y < Math.min(b.bottom - 30, innerHeight - 130);
      y += 28
    ) {
      const x = b.left + b.width * 0.55,
        target = document.elementFromPoint(x, y);
      if (
        target &&
        el.contains(target) &&
        !target.closest(
          "button,a,input,textarea,select,[role=tablist],[contenteditable=true],.calendar-surface,.task-title-stage,[data-sheet-scroll]",
        )
      )
        return { x, y };
    }
    return null;
  });
  assert(point, "a blank area is available for page swiping");
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    for (let i = 1; i <= 4; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: point.x + (dx * i) / 4, y: point.y }],
      });
      await page.waitForTimeout(12);
    }
    if (hold) await page.waitForTimeout(hold);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await cdp.detach();
  }
}
async function dragBottomNav(page, from, to) {
  navigationStep = `drag-navigation:${from}:${to}`;
  const source = await page.getByTestId(`nav-${from}`).boundingBox();
  const destination = await page.getByTestId(`nav-${to}`).boundingBox();
  assert(source && destination, "bottom navigation tabs should be visible");
  const y = source.y + source.height / 2;
  await page.mouse.move(source.x + source.width / 2, y);
  await page.mouse.down();
  await page.evaluate(() => {
    window.__scrubAnimated = false;
    const start = performance.now();
    function sample() {
      if (
        document.querySelector(".chore-bottom-nav.is-dragging") ||
        document.querySelector('[data-testid="chore-bottom-nav"].is-dragging')
      )
        window.__scrubAnimated ||= document
          .getAnimations()
          .some(
            (a) =>
              a.effect?.target?.classList?.contains("focus-pane") &&
              a.effect
                ?.getKeyframes()
                .some((k) => k.opacity !== undefined && Number(k.opacity) < 1),
          );
      if (performance.now() - start < 700) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.mouse.move(destination.x + destination.width / 2, y, {
    steps: 8,
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="chore-bottom-nav"]')
        ?.classList.contains("is-dragging"),
    null,
    { timeout: 3000 },
  );
  await page.waitForFunction(
    (path) => location.pathname === path,
    panes[to].path,
  );
  await page.locator(panes[to].selector).waitFor();
  assert.equal(
    await page.evaluate(() => window.__scrubAnimated),
    true,
    "held navigation animates the page, not only the tab indicator",
  );
  checks.push(`bottom navigation shows ${to} while the pointer is still held`);
  await page.mouse.up();
}
async function stableIdentity(page, before) {
  const after = await identity(page);
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    "navigation must preserve the selected member and device credentials",
  );
}
async function navigationMotion(page) {
  const before = await identity(page);
  const tab = (key) => page.getByTestId(`nav-${key}`);
  // Retarget before the previous spring has settled, then check the actual
  // component/router agree. Shared motion is also tested in the browser harness.
  for (const key of ["calendar", "duty", "water", "calendar", "water"]) {
    const box = await tab(key).boundingBox();
    assert(box, "rapid navigation target is visible");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await pane(page, "water");
  await page.waitForFunction(() => {
    const nav = document.querySelector('[data-testid="chore-bottom-nav"]');
    const indicator = nav
      ?.querySelector(".nav-selection")
      ?.getBoundingClientRect();
    const target = nav
      ?.querySelector('[aria-current="page"]')
      ?.getBoundingClientRect();
    return (
      nav &&
      !nav.classList.contains("is-moving") &&
      indicator &&
      target &&
      Math.abs(indicator.x - target.x) < 1
    );
  });
  const source = await tab("water").boundingBox();
  const target = await tab("calendar").boundingBox();
  assert(source && target);
  await page.mouse.move(source.x + source.width / 2, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, source.y + 20, {
    steps: 5,
  });
  await page.mouse.move(target.x + target.width / 2, source.y - 80);
  await page.mouse.up();
  await pane(page, "calendar");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await navigate(page, "calendar");
  assert.equal(
    await page
      .getByTestId("chore-bottom-nav")
      .evaluate((nav) => nav.classList.contains("is-moving")),
    false,
    "reduced motion settles immediately",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await tab("duty").focus();
  await page.keyboard.press("Enter");
  await pane(page, "duty");
  assert.equal(
    await page
      .getByTestId("chore-bottom-nav")
      .evaluate((nav) => nav.classList.contains("is-moving")),
    false,
    "keyboard navigation does not spring",
  );
  await stableIdentity(page, before);
}
async function pageMatrix(page, role) {
  const before = await identity(page);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const key of Object.keys(panes)) {
      navigationStep = `matrix:${role}:${width}:${key}`;
      await navigate(page, key);
      await openMenu(page);
      assert.equal(
        await page.getByTestId("open-chore-settings").count(),
        role === "creator" ? 1 : 0,
        `${role} task settings visibility on ${key}`,
      );
      await closeMenu(page);
      await stableIdentity(page, before);
      await snapshot(page, `${role}-${key}-${width}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await navigationMotion(page);
  navigationStep = `history:${role}:seed-duty`;
  await navigate(page, "duty");
  navigationStep = `history:${role}:seed-water`;
  await navigate(page, "water");
  navigationStep = `history:${role}:seed-calendar`;
  await navigate(page, "calendar");
  for (const [operation, key] of [
    ["back", "water"],
    ["back", "duty"],
    ["forward", "water"],
    ["forward", "calendar"],
  ]) {
    navigationStep = `history:${role}:${operation}:${key}`;
    if (operation === "back") await page.goBack();
    else await page.goForward();
    await pane(page, key);
    await stableIdentity(page, before);
  }
  for (const key of ["water", "calendar"]) {
    navigationStep = `direct-route:${role}:${key}`;
    await page.goto(origin + panes[key].path);
    await pane(page, key);
    navigationStep = `reload:${role}:${key}`;
    await page.reload();
    await pane(page, key);
    await stableIdentity(page, before);
  }
  await navigate(page, "duty");
  await dragBottomNav(page, "duty", "water");
  await pane(page, "water");
  await stableIdentity(page, before);
  await swipeSection(page, -90);
  await pane(page, "calendar");
  await stableIdentity(page, before);
  await swipeSection(page, -90);
  await page.getByText("已经是最后一页", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, panes.calendar.path);
  await swipeSection(page, 90);
  await pane(page, "water");
  await stableIdentity(page, before);
  await swipeSection(page, 90);
  await pane(page, "duty");
  await stableIdentity(page, before);
  await swipeSection(page, 90);
  await page.getByText("已经是第一页", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, panes.duty.path);
  await page.waitForTimeout(300);
  await stableIdentity(page, before);
}
async function join(page, code, userId, mark, nickname) {
  await page.goto(origin + "/");
  await page.getByTestId("guest-join-dorm").click();
  await page.getByTestId("guest-invite").fill(code);
  await page.getByTestId("guest-join-submit").click();
  await page.getByTestId("guest-member-name").waitFor();
  assert.equal(await page.locator('[data-testid^="guest-member-"]:not(input)').count(), 0);
  await noNavigation(page);
  await page.getByTestId("guest-member-name").fill("不在名单中的名字");
  await page.getByTestId("guest-name-submit").click();
  await page.getByRole("alert").filter({hasText:"名字不匹配"}).waitFor();
  await page.getByTestId("guest-member-name").fill(nickname);
  const response = page.waitForResponse(r => new URL(r.url()).pathname === "/chores/claim" && r.request().method() === "POST");
  await page.getByTestId("guest-name-submit").click();
  const result = await (await response).json();
  assert.equal(result.member.user_id, userId);
  await page.getByTestId(`marker-${mark}`).click();
  await page.getByTestId("marker-confirm").click();
  secrets.push(result.access_token);
  await pane(page, "duty");
  return result.access_token;
}
let checkedCompletionPress = false;
let checkedWaterPress = false;
async function complete(page, task) {
  const card = page.getByTestId(`chore-task-${task.key}-${task.id}`);
  if (!(await card.count()) && task.key !== "water") {
    await page
      .locator(".task-selector")
      .getByRole("button", { name: task.name, exact: true })
      .click();
    await card.waitFor();
  }
  const response = page
    .waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/chores/tasks/${task.id}/complete` &&
        r.request().method() === "PATCH",
    )
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  const completeButton = page.getByTestId(`complete-${task.key}-${task.id}`);
  if (!checkedCompletionPress || (task.key === "water" && !checkedWaterPress)) {
    await page.waitForFunction((id) => {
      const b = document.querySelector(`[data-testid="complete-${id}"]`);
      return b && !b.disabled;
    }, `${task.key}-${task.id}`);
    await completeButton.scrollIntoViewIfNeeded();
    const before = await completeButton.boundingBox();
    await page.mouse.move(
      before.x + before.width / 2,
      before.y + before.height / 2,
    );
    await page.evaluate(() => {
      window.__completionFrames = [];
      const start = performance.now();
      const sample = () => {
        const header = document.querySelector(".board-identity"),
          title = document.querySelector(
            ".task-title-stage, .water-title-stage",
          );
        window.__completionFrames.push({
          header: header?.getBoundingClientRect().top,
          title: title?.getBoundingClientRect().top,
          scroll: scrollY,
        });
        if (performance.now() - start < 1200) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.mouse.down();
    await page.waitForTimeout(120);
    const pressed = await completeButton.boundingBox();
    assert(
      pressed.height < before.height - 0.2 &&
        pressed.width < before.width - 0.5 &&
        pressed.width > before.width * 0.98,
      "completion button uses a subtle one-percent press without elastic expansion",
    );
    await page.mouse.up();
    checkedCompletionPress = true;
    if (task.key === "water") checkedWaterPress = true;
    checks.push(
      "completion button has restrained press feedback and returns on release",
    );
  } else await completeButton.click();
  const result = await response;
  if (result.error) throw result.error;
  const actual = result.value;
  assert.equal(actual.status(), 200);
  const body = await actual.json();
  assert.equal(body.task.status, "completed");
  if (await page.evaluate(() => !!window.__completionFrames)) {
    await page.waitForTimeout(1250);
    const span = await page.evaluate(() => {
      const frames = window.__completionFrames;
      delete window.__completionFrames;
      return Object.fromEntries(
        ["header", "title", "scroll"].map((key) => {
          const values = frames.map((f) => f[key]).filter(Number.isFinite);
          return [key, Math.max(...values) - Math.min(...values)];
        }),
      );
    });
    assert(
      span.header < 1.5 && span.title < 1.5 && span.scroll < 1.5,
      "completion must not move header, title, or scroll position: " +
        JSON.stringify(span),
    );
    checks.push(
      "completion keeps header, task title and scroll position stable throughout request and sync",
    );
  }
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
    navigationStep = `entry:${width}`;
    try {
      await entry.page.getByTestId("guest-create-dorm").waitFor();
    } catch (error) {
      const pageState = await entry.page
        .evaluate(() => ({
          url: location.href,
          title: document.title,
          body: document.body.innerText.slice(0, 1000),
          ready: document.readyState,
          testIds: [...document.querySelectorAll("[data-testid]")]
            .map((node) => node.getAttribute("data-testid"))
            .slice(0, 40),
        }))
        .catch((diagnostic) => ({ diagnostic: safe(diagnostic) }));
      throw new Error(
        `${safe(error)}; entry state: ${JSON.stringify(pageState)}`,
      );
    }
    await noNavigation(entry.page);
    await snapshot(entry.page, `entry-${width}`);
    await entry.page.getByTestId("guest-join-dorm").click();
    await entry.page.getByTestId("guest-invite").waitFor();
    const inviteBounds = await entry.page
      .getByTestId("guest-invite")
      .boundingBox();
    assert(
      inviteBounds.y > 844 * 0.25 &&
        inviteBounds.y + inviteBounds.height < 844 * 0.72,
      "invite input stays around visual center",
    );
    await snapshot(entry.page, `join-centered-${width}`);
    await entry.page
      .getByRole("button", { name: "邀请码帮助", exact: true })
      .click();
    await entry.page
      .getByRole("dialog", { name: "邀请码在哪里？", exact: true })
      .waitFor();
    const helpBounds = await entry.page
      .getByRole("dialog", { name: "邀请码在哪里？", exact: true })
      .boundingBox();
    assert(
      helpBounds.x >= 19 && helpBounds.x + helpBounds.width <= width - 19,
      "hint dialog keeps equal side margins",
    );
    assert(
      helpBounds.y > 0 && helpBounds.y + helpBounds.height < 844,
      "hint dialog stays inside viewport",
    );
    const backdropStyle = await entry.page
      .getByTestId("hint-glass")
      .evaluate((el) => ({
        filter: getComputedStyle(el).backdropFilter,
        background: getComputedStyle(el).backgroundColor,
      }));
    assert.equal(backdropStyle.filter, "none", "help backdrop has no blur");
    assert.notEqual(
      backdropStyle.background,
      "rgba(0, 0, 0, 0)",
      "help backdrop dims the page",
    );
    assert(
      helpBounds.y + helpBounds.height / 2 > 844 * 0.53,
      "hint dialog rests a little below screen center",
    );
    await snapshot(entry.page, `invite-help-${width}`);
    await entry.page
      .getByRole("button", { name: "知道了", exact: true })
      .click();
    await entry.page
      .getByRole("dialog", { name: "邀请码在哪里？", exact: true })
      .waitFor({ state: "hidden" });
    await entry.page
      .getByRole("button", { name: "邀请码帮助", exact: true })
      .click();
    await entry.page.getByTestId("hint-glass").waitFor();
    await entry.page
      .getByTestId("hint-glass")
      .click({ position: { x: 8, y: 8 } });
    await entry.page.getByTestId("hint-glass").waitFor({ state: "hidden" });
    await noNavigation(entry.page);
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
    created.dorm.members.find(m => m.user_id === otherId).nickname,
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
  await snapshot(b.page, "compact-menu-390");
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
  await openTool(a.page, "guest-change-dorm");
  await a.page.getByRole("button", { name: "游客体验", exact: true }).click();
  await a.page.locator('[data-testid^="guest-member-"]').first().click();
  await pane(a.page, "duty");
  await openTool(a.page, "guest-change-dorm");
  await snapshot(a.page, "saved-dorms-390");
  await a.page.getByTestId(`saved-dorm-${created.invite_code}`).click();
  await pane(a.page, "duty");
  assert.equal(
    (await identity(a.page)).choice,
    JSON.stringify({
      invite_code: created.invite_code,
      guest_mode: "dorm",
      member_id: ownerId,
    }),
  );
  checks.push(
    "switching away and selecting saved dorm restores the same member without entering an invite or claiming again",
  );
  const secondRoom = await api("/guest/create", {
    method: "POST",
    status: 201,
    data: {
      name: "第二个已加入宿舍",
      nickname: "另一位创建者",
      members: ["其他室友"],
    },
  });
  secrets.push(secondRoom.access_token);
  const secondMember = secondRoom.dorm.members.find(
    (m) => m.user_id !== secondRoom.member_id,
  );
  await openTool(b.page, "guest-change-dorm");
  await b.page.getByTestId("guest-invite").fill(secondRoom.invite_code);
  await b.page.getByTestId("guest-join-submit").click();
  await b.page.getByTestId("guest-member-name").fill(secondMember.nickname);
  await b.page.getByTestId("guest-name-submit").click();
  await b.page.getByTestId("marker-confirm").click();
  await pane(b.page, "duty");
  await b.page.reload();
  await pane(b.page, "duty");
  await openTool(b.page, "guest-change-dorm");
  await b.page.getByTestId(`saved-dorm-${created.invite_code}`).click();
  await pane(b.page, "duty");
  assert.equal(
    (await identity(b.page)).choice,
    JSON.stringify({
      invite_code: created.invite_code,
      guest_mode: "dorm",
      member_id: otherId,
    }),
  );
  checks.push(
    "ordinary member switches between two real dorms, reloads and returns with the original scoped identity without another invite",
  );
  const memberOrderBefore = (await board(otherId, memberToken)).water_order;
  await b.page.getByTestId("open-water-order").click();
  await b.page.getByTestId("order-category-water").click();
  await b.page.getByRole("dialog", { name: "抬水轮序", exact: true }).waitFor();
  assert.equal(await b.page.getByTestId("water-order-save").count(), 1);
  assert.equal(await b.page.getByTestId("order-recover-owner").count(), 0);
  await b.page.getByTestId(`order-down-water-${ownerId}`).focus();
  await b.page.keyboard.press("Enter");
  await snapshot(b.page, "member-water-order-390");
  await b.page.getByTestId("water-order-save").click();
  await b.page
    .getByRole("dialog", { name: "抬水轮序", exact: true })
    .waitFor({ state: "hidden" });
  const memberOrderAfter = await board(otherId, memberToken);
  assert.notDeepEqual(memberOrderAfter.water_order, memberOrderBefore);
  assert.equal(memberOrderAfter.water_task.assignee_id, memberOrderAfter.water_order[0]);
  await api("/chores/order", {
    method: "PATCH",
    token: memberToken,
    data: {
      version: memberOrderAfter.version,
      key: "water",
      rotation_order: memberOrderBefore,
    },
  });
  await a.page.reload();
  await pane(a.page, "duty");
  checks.push(
    "ordinary scoped member reorders and saves without creator recovery; pending water assignee is recalculated immediately",
  );
  await a.page.getByTestId("open-water-order").click();
  await a.page.getByTestId("order-category-water").click();
  await a.page.getByRole("dialog", { name: "抬水轮序", exact: true }).waitFor();
  await snapshot(a.page, "independent-water-order-390");
  await a.page.getByTestId(`order-down-water-${ownerId}`).focus();
  await a.page.keyboard.press("Enter");
  await a.page.getByTestId("water-order-save").click();
  await a.page
    .getByRole("dialog", { name: "抬水轮序", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    (await board(ownerId, ownerToken)).water_task.assignee_id,
    otherId,
  );
  await a.page.getByTestId("open-water-order").click();
  await a.page.getByTestId("order-category-water").click();
  await a.page.getByTestId(`order-up-water-${ownerId}`).focus();
  await a.page.keyboard.press("Enter");
  await a.page.getByTestId("water-order-save").click();
  await a.page
    .getByRole("dialog", { name: "抬水轮序", exact: true })
    .waitFor({ state: "hidden" });
  checks.push(
    "independent header order control persists a reorder and recalculates the pending water assignee",
  );
  await a.page.getByTestId("round-progress").click();
  await a.page.getByTestId("round-members").waitFor();
  assert.equal(await a.page.getByTestId("edit-round-order").count(), 0);
  assert.equal(
    await a.page
      .getByTestId("round-members")
      .locator(".sort-list,.hint-trigger")
      .count(),
    0,
  );
  await a.page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭详情", exact: true })
    .click();
  await a.page.getByTestId("round-members").waitFor({ state: "hidden" });
  const initialRound = (await board(ownerId, ownerToken)).rounds.find(
    (r) => r.key === "floor",
  );
  await a.page.getByTestId("open-water-order").click();
  await a.page.getByTestId("order-category-water").click();
  await a.page.getByTestId("order-category-floor").click();
  await a.page.getByTestId(`order-down-floor-${ownerId}`).focus();
  await a.page.keyboard.press("Enter");
  await a.page.getByTestId("round-order-save").click();
  await a.page.getByRole("dialog").waitFor({ state: "hidden" });
  const reorderedRound = (await board(ownerId, ownerToken)).rounds.find(
    (r) => r.key === "floor",
  );
  assert.notDeepEqual(
    reorderedRound.members.map((m) => m.user_id),
    initialRound.members.map((m) => m.user_id),
  );
  assert.equal(reorderedRound.sequence, initialRound.sequence);
  assert.equal(reorderedRound.completed, initialRound.completed);
  assert.deepEqual(
    (await board(otherId, memberToken)).rounds.find((r) => r.key === "floor")
      .members,
    reorderedRound.members,
  );
  checks.push(
    "round progress contains only completion information; task order is edited from the separate header control",
  );

  await snapshot(a.page, "duty-polished-390");
  // During rapid task changes there must always be a readable outgoing/incoming title.
  for (let i = 0; i < 12; i++) {
    const name = ["地板", "洗手池", "厕所"][i % 3];
    await a.page
      .locator(".task-selector")
      .getByRole("button", { name, exact: true })
      .click();
    assert(
      await a.page
        .locator(".task-title-stage")
        .evaluate((el) =>
          [...el.querySelectorAll("h2")].some(
            (h) => Number(getComputedStyle(h).opacity) > 0.1,
          ),
        ),
    );
  }
  await a.page
    .locator(".task-selector")
    .getByRole("button", { name: "地板", exact: true })
    .click();
  checks.push(
    "rapid task-title switches keep at least one readable title instead of a serial exit/enter blank interval",
  );
  for (const name of ["地板", "厕所", "洗手池"]) {
    await a.page.locator(".task-selector").getByRole("button", {name, exact:true}).click();
    await a.page.getByRole("button", {name:`查看${name}详情`, exact:true}).click();
    const dialog = a.page.getByRole("dialog", {name,exact:true});
    await dialog.waitFor();
    await dialog.getByRole("button", {name:"关闭详情",exact:true}).click();
    await dialog.waitFor({state:"hidden"});
  }
  checks.push("all three duty titles remain clickable and their detail dialogs dismiss independently");
  await a.page.locator(".task-selector").getByRole("button", {name:"地板",exact:true}).click();
  phase = "three_page_navigation";
  await pageMatrix(a.page, "creator");
  await pageMatrix(b.page, "member");
  checks.push(
    "creator and member each have isolated duty, water and calendar pages without horizontal overflow at 320, 390 and 430 pixels",
    "bottom navigation, page-heading swipes, boundary hints, browser back/forward and reloads preserve both browser identities and device credentials",
  );
  await navigate(a.page, "duty");
  const identityBeforeSwipe = await identity(a.page);
  await swipeBlank(a.page, -32);
  await pane(a.page, "water");
  await swipeBlank(a.page, 24, 180);
  await a.page.waitForTimeout(300);
  assert.equal(new URL(a.page.url()).pathname, "/water");
  await swipeBlank(a.page, 90);
  await pane(a.page, "duty");
  await stableIdentity(a.page, identityBeforeSwipe);
  checks.push(
    "content-area touch flick uses momentum to snap one page; a slow short pull returns; identity persists",
  );
  phase = "reminder";
  const floor = ownerBoard.today_tasks.find((t) => t.key === "floor");
  assert(floor, "creator must have initial floor task");
  // A reminder delivered during the long page matrix is intentionally shown
  // immediately; acknowledge it before opening another sheet in this flow.
  await closePresentedReminder(b.page);
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
  await a.page.getByTestId("pane-duty").waitFor();
  await a.page.getByTestId("chore-reminders").waitFor();
  assert.match(
    await a.page.getByTestId("chore-reminders").textContent(),
    /提醒你[\s\S]*地板/,
  );
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
  await a.page.waitForFunction((id) => {
    const button = document.querySelector(`[data-testid="undo-${id}"]`);
    return button && !button.disabled;
  }, floor.id);
  assert.equal(
    await a.page.getByTestId(`undo-${floor.id}`).innerText(),
    "已完成",
  );
  assert.equal(
    await a.page.getByRole("button", { name: "撤销", exact: true }).count(),
    0,
  );
  assert.equal(
    await a.page
      .getByText("值日已完成，标记已留在日历上。", { exact: true })
      .count(),
    0,
  );
  await snapshot(a.page, "undo-receipt-390");
  await a.page.getByTestId(`undo-${floor.id}`).click();
  await a.page.getByTestId(`complete-floor-${floor.id}`).waitFor();
  assert.equal(
    (await board(ownerId, ownerToken)).today_tasks.find(
      (t) => t.id === floor.id,
    ).status,
    "pending",
  );
  await complete(a.page, floor);
  checks.push(
    "tapping the completed button itself restores a mistaken check-in without a separate undo control or success toast",
  );
  ownerBoard = await board(ownerId, ownerToken);
  await navigate(a.page, "water");
  await complete(a.page, ownerBoard.water_task);
  const originalWater = ownerBoard.water_task;
  await a.page.waitForFunction((id) => {
    const button = document.querySelector(`[data-testid="undo-${id}"]`);
    return button && !button.disabled;
  }, originalWater.id);
  assert.equal(
    await a.page.getByTestId(`undo-${originalWater.id}`).innerText(),
    "已抬水",
  );
  await snapshot(a.page, "water-nudge-focus-390");
  await a.page.getByTestId(`undo-${originalWater.id}`).click();
  await a.page.getByTestId(`complete-water-${originalWater.id}`).waitFor();
  await complete(a.page, originalWater);
  await a.page.getByRole("button", { name: "查看任务", exact: true }).click();
  await a.page.locator(".sheet-layer.is-nonmodal").waitFor();
  assert.equal(await a.page.locator(".sheet-scrim").count(), 0);
  await a.page.getByTestId("nav-calendar").click();
  await pane(a.page, "calendar");
  await navigate(a.page, "water");
  checks.push(
    "water undo rewinds the turn; its nonmodal bottom details preserve interaction with the page",
  );
  await b.page.reload();
  await pane(b.page, "duty");
  memberBoard = await board(otherId, memberToken);
  const toilet = memberBoard.today_tasks.find((t) => t.key === "toilet");
  assert(toilet, "second member must have initial toilet task");
  await complete(b.page, toilet);
  const sink = memberBoard.today_tasks.find((t) => t.key === "sink");
  assert(sink, "second member must have initial washbasin task");
  await complete(b.page, sink);
  await navigate(b.page, "water");
  await complete(b.page, memberBoard.water_task);
  await a.page.reload();
  await pane(a.page, "water");
  await navigate(a.page, "calendar");
  ownerBoard = await board(ownerId, ownerToken);
  assert.equal(ownerBoard.calendar.length, 5);
  const day = a.page.getByTestId(`calendar-day-${ownerBoard.today}`);
  await day.click();
  const details = a.page.getByTestId("calendar-day-details");
  assert.equal(await details.locator(".calendar-record").count(), 5);
  assert.equal(await day.locator(".member-mark").count(), 2);
  assert.match(await details.textContent(), /创建者/);
  assert.match(await details.textContent(), /室友甲/);
  await a.page.getByTestId(`calendar-undo-${floor.id}`).click();
  await a.page.waitForFunction(
    () =>
      document.querySelectorAll(".calendar-details .calendar-record").length ===
      4,
  );
  assert.equal(
    (await board(ownerId, ownerToken)).calendar.some((t) => t.id === floor.id),
    false,
  );
  await a.page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭详情", exact: true })
    .click();
  await details.waitFor({ state: "hidden" });
  await navigate(a.page, "duty");
  await complete(a.page, floor);
  await navigate(a.page, "calendar");
  await day.click();
  await a.page.waitForFunction(
    () =>
      document.querySelectorAll(".calendar-details .calendar-record").length ===
      5,
  );
  checks.push(
    "clicking the own completed calendar row restores that task without a separate undo button; completing again restores the calendar",
  );
  ownerBoard = await board(ownerId, ownerToken);
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
    "floor, toilet, washbasin and two successive water turns record server completion times and show both personal marks with five calendar detail rows",
  );
  phase = "customize";
  await navigate(a.page, "duty");
  await openTool(a.page, "open-chore-settings");
  await a.page.getByTestId("settings-select-floor").click();
  await a.page.getByTestId("mode-scheduled-floor").click();
  await a.page
    .getByTestId("settings-content-floor")
    .fill("地板：先扫再拖，床下也要清洁");
  await a.page.getByTestId("settings-time-floor").fill("20:15");
  await a.page.getByTestId("settings-rotation-floor").fill("2");
  await a.page.getByTestId("settings-select-toilet").click();
  await a.page.getByTestId("mode-scheduled-toilet").click();
  await a.page
    .getByTestId("settings-content-toilet")
    .fill("厕所：刷洗便池、台面和地漏");
  await a.page.getByTestId("settings-time-toilet").fill("21:20");
  await a.page.getByTestId("settings-select-sink").click();
  await a.page.getByTestId("mode-scheduled-sink").click();
  await a.page
    .getByTestId("settings-content-sink")
    .fill("洗手池：刷洗池面、龙头和排水口");
  await a.page.getByTestId("settings-time-sink").fill("21:40");
  await a.page.getByTestId("settings-select-water").click();
  await a.page
    .getByTestId("settings-content-water")
    .fill("抬水：从一楼运一桶饮用水");
  await a.page.getByTestId(`order-up-water-${otherId}`).focus();
  await a.page.keyboard.press("Enter");
  const draftOrder = await a.page
    .locator(".sort-list .sort-person")
    .allTextContents();
  await a.page.route(
    "**/chores/settings",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: { message: "版本冲突" } }),
      });
    },
    { times: 1 },
  );
  await a.page.getByTestId("settings-save").click();
  assert.equal(await a.page.getByTestId("settings-save").isDisabled(), true);
  await a.page
    .getByRole("alert")
    .filter({ hasText: "室友刚刚更新了排班" })
    .waitFor();
  assert.deepEqual(
    await a.page.locator(".sort-list .sort-person").allTextContents(),
    draftOrder,
  );
  assert.equal(
    await a.page.getByTestId("settings-content-water").inputValue(),
    "抬水：从一楼运一桶饮用水",
  );
  checks.push(
    "delayed settings save disables duplicate submissions; version conflict retains edited order and content with an explicit error",
  );
  await snapshot(a.page, "custom-settings-390");
  const settingsResponse = a.page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/chores/settings" &&
      r.request().method() === "PATCH",
  );
  await a.page.getByTestId("settings-save").click();
  assert.equal((await settingsResponse).status(), 200);
  const customized = await board(ownerId, ownerToken);
  assert.equal(
    new Set(customized.today_tasks.map((task) => task.key)).size,
    customized.today_tasks.length,
    "switching to scheduled chores must not duplicate completed round tasks on the home page",
  );
  const originalWaterDeadline = ownerBoard.categories.find(
    (category) => category.key === "water",
  ).deadline_time;
  const expected = {
    floor: ["地板：先扫再拖，床下也要清洁", "20:15"],
    toilet: ["厕所：刷洗便池、台面和地漏", "21:20"],
    sink: ["洗手池：刷洗池面、龙头和排水口", "21:40"],
    water: ["抬水：从一楼运一桶饮用水", originalWaterDeadline],
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
    "creator changes the content and time of all four categories, adjusts continuity/order, and keeps completed calendar history",
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
    created.dorm.members.find(m => m.user_id === otherId).nickname,
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
        restored.calendar.filter(
          (record) => record.completed_date === restored.today,
        ).length,
      );
    }
    await snapshot(a.page, `final-${key}-390`);
    if (key === "calendar") {
      await a.page
        .locator(".sheet-layer .elastic-sheet")
        .getByRole("button", { name: "关闭详情", exact: true })
        .click();
      await a.page.locator(".sheet-layer").waitFor({ state: "detached" });
      await a.page.getByTestId("calendar-view-list").click();
      await a.page.getByTestId("calendar-list").waitFor();
      assert.equal(
        await a.page.locator('[data-testid^="calendar-list-record-"]').count(),
        restored.calendar.length,
      );
      await a.page.evaluate(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "instant",
        });
      });
      const navigation = await a.page
        .getByTestId("chore-bottom-nav")
        .boundingBox();
      for (const record of await a.page
        .locator(".calendar-list .record-row")
        .all()) {
        const bounds = await record.boundingBox();
        assert(
          bounds && bounds.y >= 0 && bounds.y + bounds.height <= navigation.y,
          "all calendar list records must be reachable above the fixed bottom navigation",
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
    "calendar list shows person, task and time; its rows remain reachable above the fixed bottom navigation",
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
  let uiState;
  if (diagnosticPage && !diagnosticPage.isClosed()) {
    uiState = await diagnosticPage
      .evaluate(async () => {
        const button = document.querySelector('[data-testid="open-tools"]');
        const bounds = [];
        for (let i = 0; i < 6; i++) {
          await new Promise(requestAnimationFrame);
          const rect = button?.getBoundingClientRect();
          bounds.push(rect && [rect.x, rect.y, rect.width, rect.height]);
        }
        return {
          path: location.pathname,
          historyLength: history.length,
          historyState: history.state,
          navTabs: [...document.querySelectorAll("[data-testid^='nav-']")].map(
            (node) => ({
              id: node.getAttribute("data-testid"),
              rect: (() => {
                const { x, y, width, height } = node.getBoundingClientRect();
                return [x, y, width, height];
              })(),
            }),
          ),
          bounds,
          scrollY,
          nav: document
            .querySelector('[data-testid="chore-bottom-nav"]')
            ?.getAttribute("style"),
          sheets: [...document.querySelectorAll(".sheet-layer")].map((node) =>
            node.textContent?.trim().slice(0, 120),
          ),
          animations: document.getAnimations().map((animation) => ({
            name: animation.animationName || animation.constructor.name,
            state: animation.playState,
          })),
        };
      })
      .catch((e) => safe(e));
    if (uiState && typeof uiState === "object")
      Object.assign(uiState, { expectedPane });
  }
  Object.assign(result, {
    status: "failed",
    phase,
    ...(navigationStep ? { navigationStep } : {}),
    reason: safe(error),
    ...(uiState ? { uiState } : {}),
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

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { chromium } from "../frontend/node_modules/@playwright/test/index.mjs";

// Tests only a disposable database and browser profiles. No production data or
// credentials are loaded, changed, or written into the result.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dorm-local-qa-"));
const database = path.join(temporary, "persistence.sqlite");
const checks = [];
const secrets = [];
let service;
let browser;
let baseUrl;
let phase = "start_local_server";

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
  let output = "";
  let errors = "";
  const exited = new Promise((resolve) => child.once("exit", resolve));
  service = { child, exited };
  try {
    const ready = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(new Error("LOCAL_READY was not emitted within 30 seconds")),
        30000,
      );
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.stderr.on("data", (data) => {
        errors = (errors + data).slice(-2000);
      });
      child.stdout.on("data", (data) => {
        output = (output + data).slice(-4000);
        const match = output.match(/^LOCAL_READY\s+(\{[^\n]+\})\s*$/m);
        if (!match) return;
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(match[1]));
        } catch {
          reject(new Error("LOCAL_READY contains invalid JSON"));
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Local server exited before ready (${code}): ${safe(errors)}`,
          ),
        );
      });
    });
    assert.equal(ready.persistent, true);
    assert(Number.isInteger(ready.port) && ready.port > 0);
    const origin = new URL(ready.url);
    assert.equal(origin.hostname, "127.0.0.1");
    assert.equal(Number(origin.port), ready.port);
    return origin.origin;
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
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(new URL(route, baseUrl), {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(
    response.status,
    status,
    `${route.split("?")[0]}: unexpected status`,
  );
  assert(/json/i.test(response.headers.get("content-type") || ""));
  assert(/no-store/i.test(response.headers.get("cache-control") || ""));
  return response.json();
}

function addDays(day, amount) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function readDatabase() {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    return {
      demos: db
        .prepare(
          "SELECT id,invite_code FROM dormitories WHERE is_demo=1 ORDER BY id",
        )
        .all(),
      sessions: db
        .prepare(
          "SELECT token_hash,user_id,kind FROM sessions ORDER BY token_hash",
        )
        .all(),
      rooms: db
        .prepare(
          "SELECT id,name,invite_code,schedule_rules,task_text,deadline_time,schedule_version FROM dormitories ORDER BY id",
        )
        .all(),
      duties: db.prepare("SELECT * FROM duty_tasks ORDER BY id").all(),
      choreSettings: db
        .prepare("SELECT * FROM chore_settings ORDER BY dorm_id")
        .all(),
      choreCategories: db
        .prepare("SELECT * FROM chore_categories ORDER BY id")
        .all(),
      choreTasks: db.prepare("SELECT * FROM chore_tasks ORDER BY id").all(),
      memberMarks: db.prepare("SELECT * FROM member_marks ORDER BY id").all(),
      memberSessions: db
        .prepare("SELECT * FROM member_sessions ORDER BY token_hash")
        .all(),
    };
  } finally {
    db.close();
  }
}

async function context() {
  const result = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  result.setDefaultTimeout(20000);
  return result;
}

async function choose(page, code, userId) {
  await page.goto(`${baseUrl}/?invite_code=${encodeURIComponent(code)}`);
  await page.getByTestId(`guest-member-${userId}`).click();
  await page.getByTestId("marker-confirm").click();
  await page.getByTestId("guest-change-member").waitFor();
  await page.getByTestId("chore-refresh").waitFor();
}

const result = {
  date: new Date().toISOString(),
  workerBundleSha256: createHash("sha256")
    .update(await fs.readFile(path.join(root, "site/worker/index.js")))
    .digest("hex"),
  runtime: "real Node HTTP server + persistent SQLite file",
  browser: "Chrome headless mobile emulation, independent contexts",
  database: "disposable temporary file; removed after verification",
  physicalIphone: "not tested",
  scope:
    "separate duty, water and calendar pages with scoped member identity and creator permissions",
  recoveryFixture:
    "already loaded and bound creator ChoreBoard; temporary API outage, not first identity initialization or first offline visit",
};

try {
  baseUrl = await start();
  const port = Number(new URL(baseUrl).port);
  const health = await api("/health");
  assert.equal(health.application, "dorm-duty-local");
  assert.equal(health.runtime, "node-worker-local");
  assert.equal(health.storage, "sqlite");
  assert.equal(health.persistent, true);
  const initial = readDatabase();
  assert.equal(initial.demos.length, 1, "exactly one demo must be initialized");
  const demo = await api("/guest/dorm");
  assert.equal(demo.id, initial.demos[0].id);
  assert.equal(demo.members.length, 6);
  checks.push(
    "fresh persistent database migrates and creates one six-member demo",
  );

  phase = "create_customize_complete";
  const created = await api("/guest/create", {
    method: "POST",
    status: 201,
    data: {
      name: "本地持久化验收宿舍",
      nickname: "本地管理员",
      members: ["室友甲", "室友乙"],
    },
  });
  const token = created.access_token;
  secrets.push(token);
  const admin = await api("/auth/me", { token });
  assert.equal(admin.id, created.member_id);
  const room = await api("/dorms/current", { token });
  const today = (
    await api(
      `/guest/tasks?invite_code=${created.invite_code}&member_id=${created.member_id}`,
    )
  ).today;
  const configured = await api("/dorms/current", {
    method: "PATCH",
    token,
    data: {
      expected_version: room.schedule_version,
      name: "重启后仍在的宿舍",
      task_text: "扫地\n擦桌\n垃圾分类",
      deadline_time: "21:15",
      rotation_order: [...room.rotation_order].reverse(),
      rotation_start_date: today,
      schedule_rules: {
        weekdays: [1, 3, 5, 7],
        rotation_days: 2,
        horizon_days: 30,
        skip_dates: [addDays(today, 3)],
        weekly_tasks: { 1: { task_text: "周一清理", deadline_time: "20:30" } },
      },
    },
  });
  const todayTask = (
    await api(
      `/guest/tasks?invite_code=${created.invite_code}&member_id=${created.member_id}`,
    )
  ).today_task;
  assert(
    todayTask,
    "creator must retain today's original assignment after rule changes",
  );
  await api(`/duties/${todayTask.id}/complete`, { method: "PATCH", token });

  // New chores preserve their own rules, identity bindings and immutable marker
  // snapshots alongside the legacy duty/history data.
  const choreMemberId = configured.rotation_order[0];
  const claimed = await api("/chores/claim", {
    method: "POST",
    status: 201,
    data: { invite_code: created.invite_code, member_id: choreMemberId, nickname: created.dorm.members.find(m => m.user_id === choreMemberId).nickname },
  });
  const memberToken = claimed.access_token;
  secrets.push(memberToken);
  const boardPath = (id) =>
    `/chores/board?invite_code=${created.invite_code}&member_id=${id}`;
  const creatorBoard = await api(boardPath(created.member_id), { token });
  assert.equal(creatorBoard.is_creator, true);
  assert.deepEqual(
    creatorBoard.categories.map((category) => category.key),
    ["floor", "toilet", "sink", "water"],
  );
  await api("/chores/settings", {
    method: "PATCH",
    token,
    data: {
      version: creatorBoard.version,
      categories: [
        {
          key: "floor",
          content: "重启后保留的地板任务",
          deadline_time: "21:10",
          rotation_days: 2,
        },
      ],
    },
  });
  const memberBoard = await api(boardPath(choreMemberId), {
    token: memberToken,
  });
  assert.equal(memberBoard.is_creator, false);
  const choreTask = memberBoard.today_tasks.find(
    (task) => task.key === "floor",
  );
  assert(
    choreTask?.can_complete,
    "bound member should complete only their own scheduled chore",
  );
  await api(`/chores/tasks/${choreTask.id}/complete`, {
    method: "PATCH",
    token: memberToken,
    data: {},
  });
  const memberHash = createHash("sha256").update(memberToken).digest("hex");
  const before = readDatabase();
  const sessionHash = createHash("sha256").update(token).digest("hex");
  assert(
    before.sessions.some(
      (row) => row.token_hash === sessionHash && row.kind === "device",
    ),
  );
  assert(before.sessions.every((row) => row.token_hash !== token));
  assert(
    before.memberSessions.some(
      (row) => row.token_hash === memberHash && row.user_id === choreMemberId,
    ),
  );
  assert(
    before.choreTasks.some(
      (row) =>
        row.id === choreTask.id &&
        row.status === "completed" &&
        row.marker_id_snapshot,
    ),
  );
  assert(
    before.duties.some(
      (row) =>
        row.id === todayTask.id &&
        row.status === "completed" &&
        row.completed_at,
    ),
  );
  checks.push(
    "creator device session, scoped member binding, legacy/custom chore rules and both completed duty and chore marker snapshot are committed to SQLite",
  );

  phase = "restart_preserves_business_data";
  await stop();
  baseUrl = await start(port);
  const after = readDatabase();
  assert.deepEqual(
    after.demos,
    before.demos,
    "demo must not be reseeded on restart",
  );
  assert.deepEqual(
    after.rooms,
    before.rooms,
    "room rules/invites must persist on restart",
  );
  assert.deepEqual(
    after.duties,
    before.duties,
    "history and assignments must persist on restart",
  );
  assert.deepEqual(
    after.sessions,
    before.sessions,
    "device sessions must persist on restart",
  );
  for (const key of [
    "choreSettings",
    "choreCategories",
    "choreTasks",
    "memberMarks",
    "memberSessions",
  ])
    assert.deepEqual(
      after[key],
      before[key],
      `${key} must persist exactly on restart`,
    );
  assert.equal((await api("/auth/me", { token })).id, admin.id);
  const restored = await api("/dorms/current", { token });
  assert.equal(restored.invite_code, room.invite_code);
  assert.equal(restored.task_text, configured.task_text);
  assert.deepEqual(restored.schedule_rules, configured.schedule_rules);
  const completed = await api(
    `/guest/tasks?invite_code=${created.invite_code}&member_id=${created.member_id}`,
  );
  assert.equal(completed.today_task.id, todayTask.id);
  assert.equal(completed.today_task.status, "completed");
  assert.equal(completed.today_task.can_complete, false);
  await api(`/duties/${todayTask.id}/complete`, {
    method: "PATCH",
    token,
    status: 409,
  });
  const restoredBoard = await api(boardPath(choreMemberId), {
    token: memberToken,
  });
  const restoredRecord = restoredBoard.calendar.find(
    (record) => record.id === choreTask.id,
  );
  assert.equal(restoredRecord?.marker_id, choreTask.marker_id);
  assert.equal(
    restoredBoard.categories.find((category) => category.key === "floor")
      .content,
    "重启后保留的地板任务",
  );
  await api(`/chores/tasks/${choreTask.id}/complete`, {
    method: "PATCH",
    token: memberToken,
    data: {},
    status: 409,
  });
  checks.push(
    "restart preserves exact legacy and three-chore rules, invite, task/history IDs, marker calendar, creator/member hashed sessions and duplicate-completion protection",
  );

  phase = "browser_owner_restore_and_viewer_isolation";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const ownerContext = await context();
  const owner = await ownerContext.newPage();
  await owner.goto(baseUrl + "/");
  await owner.getByTestId("guest-join-dorm").waitFor();
  await owner.evaluate((value) => {
    localStorage.setItem("dorm-owner-token", value);
    sessionStorage.clear();
  }, token);
  await owner.goto(baseUrl + "/dorm");
  await owner.getByRole("button", { name: "自定义排班与任务" }).waitFor();
  assert.equal(
    await owner.evaluate(() => sessionStorage.getItem("dorm-token")),
    token,
  );
  await owner.evaluate(() => sessionStorage.clear());
  await owner.reload();
  await owner.getByRole("button", { name: "自定义排班与任务" }).waitFor();
  assert.equal(
    await owner.evaluate(() => sessionStorage.getItem("dorm-token")),
    token,
  );
  checks.push(
    "clearing sessionStorage and reloading management restores the administrator from browser localStorage without a password",
  );

  const viewerContext = await context();
  const viewer = await viewerContext.newPage();
  const other = created.dorm.members.find(
    (member) => member.user_id !== created.member_id,
  );
  await choose(viewer, created.invite_code, other.user_id);
  assert.deepEqual(
    await viewer.evaluate(() => ({
      token: sessionStorage.getItem("dorm-token"),
      owner: localStorage.getItem("dorm-owner-token"),
    })),
    { token: null, owner: null },
  );
  const unauthorized = await viewer.evaluate(async () => {
    const response = await fetch("/dorms/current", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expected_version: 1,
        task_text: "viewer must not write",
      }),
    });
    return response.status;
  });
  assert.equal(unauthorized, 401);
  assert.equal(
    await viewer.getByRole("link", { name: "宿舍成员管理" }).count(),
    0,
  );
  assert.equal(await viewer.getByTestId("open-chore-settings").count(), 0);
  const viewerToken = await viewer.evaluate(
    ({ code, memberId }) =>
      localStorage.getItem(`dorm-chore-device-v1:${code}:${memberId}`),
    { code: created.invite_code, memberId: other.user_id },
  );
  assert(
    viewerToken && /^[a-f0-9]{64}$/.test(viewerToken),
    "choosing and confirming a member must bind a scoped chore identity",
  );
  secrets.push(viewerToken);
  await api("/chores/settings", {
    method: "PATCH",
    token: viewerToken,
    data: { version: 1, categories: [] },
    status: 403,
  });
  await api("/dorms/current", { token: viewerToken, status: 401 });
  await viewer.goto(baseUrl + "/manage");
  await viewer.waitForURL((url) => url.pathname === "/admin/login");
  await viewer.locator('input[type="password"]').waitFor();
  checks.push(
    "second browser confirms name/marker and receives scoped chore identity, no owner credential or creator UI; legacy management is unauthorized and chore settings return 403",
  );

  phase = "same_spa_recovers_after_server_outage";
  const recoveryContext = await context();
  const recovery = await recoveryContext.newPage();
  await recovery.goto(baseUrl + "/");
  await recovery.getByTestId("guest-join-dorm").waitFor();
  await recovery.evaluate((value) => {
    localStorage.setItem("dorm-owner-token", value);
    sessionStorage.clear();
  }, token);
  await choose(recovery, created.invite_code, created.member_id);
  await recovery.getByTestId("open-chore-settings").waitFor();
  const marker = randomBytes(12).toString("hex");
  await recovery.evaluate((marker) => {
    window.__localRecoveryDocument = marker;
  }, marker);
  await stop();
  await recovery.getByTestId("chore-refresh").click();
  await recovery
    .locator(".chore-board .chore-inline-error")
    .getByText("连接服务失败，请稍后重试", { exact: false })
    .waitFor();
  assert.deepEqual(
    await recovery.evaluate(() => ({
      owner: localStorage.getItem("dorm-owner-token"),
      token: sessionStorage.getItem("dorm-token"),
    })),
    { owner: token, token },
  );
  baseUrl = await start(port);
  const restoredResponse = recovery.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/chores/board" &&
      response.status() === 200,
  );
  await recovery.getByTestId("chore-refresh").click();
  await restoredResponse;
  await recovery
    .locator(".chore-board .chore-inline-error")
    .waitFor({ state: "detached" });
  await recovery.getByTestId("open-chore-settings").waitFor();
  await recovery.getByRole("link", { name: "宿舍成员管理" }).click();
  await recovery.waitForURL((url) => url.pathname === "/dorm");
  await recovery.getByRole("button", { name: "自定义排班与任务" }).waitFor();
  await recovery.locator(".bottom-nav").waitFor();
  assert.equal(
    await recovery.evaluate(() => window.__localRecoveryDocument),
    marker,
    "recovery must succeed inside the same document, without reloading the SPA",
  );
  assert.equal(await recovery.locator('input[type="password"]').count(), 0);
  assert.equal(
    await recovery.evaluate(() => sessionStorage.getItem("dorm-token")),
    token,
  );
  checks.push(
    "already bound creator ChoreBoard keeps credentials on refresh failure; after restart the same SPA refreshes successfully and enters creator management without reload",
  );

  phase = "invalid_token_does_not_retry_forever";
  const invalidContext = await context();
  const invalid = await invalidContext.newPage();
  await invalid.goto(baseUrl + "/");
  const invalidToken = randomBytes(32).toString("hex");
  secrets.push(invalidToken);
  await invalid.evaluate(
    (value) => localStorage.setItem("dorm-owner-token", value),
    invalidToken,
  );
  await invalid.goto(baseUrl + "/manage");
  await invalid.waitForURL((url) => url.pathname === "/admin/login");
  await invalid.locator('input[type="password"]').waitFor();
  assert.deepEqual(
    await invalid.evaluate(() => ({
      owner: localStorage.getItem("dorm-owner-token"),
      token: sessionStorage.getItem("dorm-token"),
    })),
    { owner: null, token: null },
  );
  const final = readDatabase();
  assert.equal(final.demos.length, 1);
  assert.equal(final.rooms.length, 2);
  assert(
    final.duties.some(
      (row) => row.id === todayTask.id && row.status === "completed",
    ),
  );
  checks.push(
    "a genuinely invalid device token receives 401 and is cleared; third server start still has exactly one demo and original completed history",
  );
  Object.assign(result, { status: "passed", checks });
} catch (error) {
  Object.assign(result, {
    status: "failed",
    phase,
    reason: safe(error.message || error.name),
    checks,
  });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop();
  await fs.rm(temporary, { recursive: true, force: true });
  const evidencePath = path.join(
    root,
    "docs/evidence/chores/pages/local-persistence.json",
  );
  await fs.mkdir(path.dirname(evidencePath), { recursive: true });
  await fs.writeFile(evidencePath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}
